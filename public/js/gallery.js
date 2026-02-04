/**
 * 3D 照片画廊
 * 使用 Three.js 将照片排列成完美圆形展示
 */

// 圆形裁剪 Shader
const CircleClipShader = {
  vertexShader: `
    varying vec2 vUv;
    varying vec3 vWorldPosition;

    void main() {
      vUv = uv;
      vec4 worldPosition = modelMatrix * vec4(position, 1.0);
      vWorldPosition = worldPosition.xyz;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: `
    uniform sampler2D map;
    uniform vec3 diffuse;
    uniform float opacity;
    uniform float clipRadius;
    uniform bool hasTexture;

    varying vec2 vUv;
    varying vec3 vWorldPosition;

    void main() {
      // 计算到圆心的距离
      float dist = length(vWorldPosition.xy);

      // 如果超出圆形范围，丢弃像素
      if (dist > clipRadius) {
        discard;
      }

      vec4 color;
      if (hasTexture) {
        color = texture2D(map, vUv);
        color.rgb *= diffuse;
      } else {
        color = vec4(diffuse, 1.0);
      }
      color.a *= opacity;

      gl_FragColor = color;
    }
  `
};

// 默认网格大小和照片数
const DEFAULT_GRID_SIZE = 15;

class PhotoGallery {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.photoMeshes = [];
    this.textureLoader = new THREE.TextureLoader();
    this.photos = [];
    this.photoSize = 2; // 照片大小
    this.gridSize = DEFAULT_GRID_SIZE; // 网格大小
    this.clipRadius = 0; // 圆形裁剪半径
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.meshToPhoto = new Map();

    this.init();
  }

  init() {
    this.setupScene();
    this.setupCamera();
    this.setupRenderer();
    this.setupControls();
    this.setupLights();
    this.setupEventListeners();
    this.loadPhotos();
    this.animate();
  }

  setupScene() {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0a0a0a);

    // 添加星空背景效果
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 1000;
    const positions = new Float32Array(starCount * 3);

    for (let i = 0; i < starCount * 3; i += 3) {
      positions[i] = (Math.random() - 0.5) * 200;
      positions[i + 1] = (Math.random() - 0.5) * 200;
      positions[i + 2] = (Math.random() - 0.5) * 200;
    }

    starGeometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const starMaterial = new THREE.PointsMaterial({
      color: 0xffffff,
      size: 0.2,
      transparent: true,
      opacity: 0.6
    });
    const stars = new THREE.Points(starGeometry, starMaterial);
    this.scene.add(stars);
  }

  setupCamera() {
    const aspect = window.innerWidth / window.innerHeight;
    this.camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 1000);
    this.camera.position.set(0, 0, 35);
  }

  setupRenderer() {
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    document.getElementById('canvas-container').appendChild(this.renderer.domElement);
  }

  setupControls() {
    this.controls = new THREE.OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.05;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 100;
    this.controls.enablePan = true;
    this.controls.autoRotate = true;
    this.controls.autoRotateSpeed = 0.5;
  }

  setupLights() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    this.scene.add(ambientLight);
  }

  setupEventListeners() {
    window.addEventListener('resize', () => this.onWindowResize());

    const uploadArea = document.getElementById('upload-area');
    const fileInput = document.getElementById('file-input');

    uploadArea.addEventListener('click', () => fileInput.click());

    uploadArea.addEventListener('dragover', (e) => {
      e.preventDefault();
      uploadArea.classList.add('dragover');
    });

    uploadArea.addEventListener('dragleave', () => {
      uploadArea.classList.remove('dragover');
    });

    uploadArea.addEventListener('drop', (e) => {
      e.preventDefault();
      uploadArea.classList.remove('dragover');
      const files = e.dataTransfer.files;
      if (files.length > 0) {
        this.uploadFiles(files);
      }
    });

    fileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.uploadFiles(e.target.files);
      }
    });

    const toggleBtn = document.getElementById('toggle-panel');
    const panel = document.getElementById('upload-panel');

    toggleBtn.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
      toggleBtn.textContent = panel.classList.contains('collapsed') ? '展开面板' : '收起面板';
    });

    this.renderer.domElement.addEventListener('mousedown', () => {
      this.controls.autoRotate = false;
    });

    this.renderer.domElement.addEventListener('mouseup', () => {
      setTimeout(() => {
        this.controls.autoRotate = true;
      }, 3000);
    });

    const clearBtn = document.getElementById('clear-photos');
    clearBtn.addEventListener('click', () => this.clearAllPhotos());

    this.renderer.domElement.addEventListener('click', (e) => this.onPhotoClick(e));

    const lightbox = document.getElementById('lightbox');
    lightbox.addEventListener('click', () => this.closeLightbox());
  }

  onPhotoClick(event) {
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.camera);
    const intersects = this.raycaster.intersectObjects(this.photoMeshes);

    if (intersects.length > 0) {
      const mesh = intersects[0].object;
      const photo = this.meshToPhoto.get(mesh);
      if (photo) {
        this.openLightbox(photo);
      }
    }
  }

  openLightbox(photo) {
    const lightbox = document.getElementById('lightbox');
    const lightboxImg = document.getElementById('lightbox-img');
    lightboxImg.src = photo.url;
    lightbox.classList.remove('hidden');
    lightbox.classList.add('visible');
  }

  closeLightbox() {
    const lightbox = document.getElementById('lightbox');
    lightbox.classList.remove('visible');
    setTimeout(() => lightbox.classList.add('hidden'), 300);
  }

  async clearAllPhotos() {
    if (!confirm('确定要清除所有照片吗？此操作不可恢复。')) {
      return;
    }

    try {
      const response = await fetch('/api/photos/all', {
        method: 'DELETE'
      });
      const data = await response.json();

      if (data.success) {
        this.photos = [];
        this.updatePhotoCount(0);
        this.createPhotoCircle();
        this.showToast('所有照片已清除', 'success');
      } else {
        this.showToast('清除失败', 'error');
      }
    } catch (error) {
      console.error('清除照片错误:', error);
      this.showToast('清除失败', 'error');
    }
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  async loadPhotos() {
    try {
      const response = await fetch('/api/photos?limit=1000');
      const data = await response.json();

      if (data.success) {
        this.photos = data.photos;
        this.updatePhotoCount(data.count);
        this.createPhotoCircle();
      }
    } catch (error) {
      console.error('加载照片失败:', error);
      this.showToast('加载照片失败', 'error');
    } finally {
      this.hideLoading();
    }
  }

  // 计算需要的网格大小来容纳照片数量
  calculateGridSize(photoCount) {
    // 圆形面积 = π * r², 网格面积 = gridSize²
    // 圆形内的格子数约为 π * (gridSize/2)² = π * gridSize² / 4
    // 所以 gridSize = sqrt(4 * photoCount / π)
    const minGrid = Math.ceil(Math.sqrt(4 * photoCount / Math.PI));
    // 确保是奇数，这样圆心在正中间
    return minGrid % 2 === 0 ? minGrid + 1 : minGrid;
  }

  createPhotoCircle() {
    // 清除现有照片
    this.photoMeshes.forEach(mesh => {
      this.scene.remove(mesh);
      if (mesh.material.uniforms && mesh.material.uniforms.map.value) {
        mesh.material.uniforms.map.value.dispose();
      }
      mesh.material.dispose();
      mesh.geometry.dispose();
    });
    this.photoMeshes = [];
    this.meshToPhoto.clear();

    const photoCount = this.photos.length;

    if (photoCount === 0) {
      this.createPlaceholder();
      return;
    }

    // 计算合适的网格大小
    this.gridSize = this.calculateGridSize(photoCount);

    // 圆形半径（略小于网格一半，确保完美圆形）
    this.clipRadius = (this.gridSize * this.photoSize) / 2 - 0.01;

    const halfGrid = (this.gridSize - 1) / 2;
    let photoIndex = 0;

    // 按网格排列所有照片
    for (let row = 0; row < this.gridSize && photoIndex < photoCount; row++) {
      for (let col = 0; col < this.gridSize && photoIndex < photoCount; col++) {
        const x = (col - halfGrid) * this.photoSize;
        const y = (halfGrid - row) * this.photoSize;

        // 只在圆形范围内创建照片（包括边缘会被裁剪的）
        const dist = Math.sqrt(x * x + y * y);
        if (dist < this.clipRadius + this.photoSize) {
          this.createPhotoMesh(this.photos[photoIndex], x, y);
          photoIndex++;
        }
      }
    }
  }

  createPhotoMesh(photo, x, y) {
    const geometry = new THREE.PlaneGeometry(this.photoSize, this.photoSize);

    // 使用自定义 Shader 材质实现圆形裁剪
    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: null },
        diffuse: { value: new THREE.Color(0x333333) },
        opacity: { value: 0.9 },
        clipRadius: { value: this.clipRadius },
        hasTexture: { value: false }
      },
      vertexShader: CircleClipShader.vertexShader,
      fragmentShader: CircleClipShader.fragmentShader,
      transparent: true,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, 0);

    this.scene.add(mesh);
    this.photoMeshes.push(mesh);
    this.meshToPhoto.set(mesh, photo);

    // 异步加载纹理
    this.textureLoader.load(
      photo.url,
      (texture) => {
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;

        // 1:1 裁剪居中显示
        const img = texture.image;
        const imgAspect = img.width / img.height;

        if (imgAspect > 1) {
          texture.repeat.set(1 / imgAspect, 1);
          texture.offset.set((1 - 1 / imgAspect) / 2, 0);
        } else {
          texture.repeat.set(1, imgAspect);
          texture.offset.set(0, (1 - imgAspect) / 2);
        }

        material.uniforms.map.value = texture;
        material.uniforms.diffuse.value.set(0xffffff);
        material.uniforms.hasTexture.value = true;
        material.uniforms.opacity.value = 0;

        this.fadeIn(material);
      },
      undefined,
      (error) => {
        console.warn('纹理加载失败:', photo.url);
      }
    );
  }

  fadeIn(material, duration = 500) {
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      material.uniforms.opacity.value = progress;

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    animate();
  }

  createPlaceholder() {
    // 默认使用 15x15 网格
    this.gridSize = DEFAULT_GRID_SIZE;
    this.clipRadius = (this.gridSize * this.photoSize) / 2 - 0.01;

    const halfGrid = (this.gridSize - 1) / 2;

    for (let row = 0; row < this.gridSize; row++) {
      for (let col = 0; col < this.gridSize; col++) {
        const x = (col - halfGrid) * this.photoSize;
        const y = (halfGrid - row) * this.photoSize;

        const dist = Math.sqrt(x * x + y * y);
        if (dist < this.clipRadius + this.photoSize) {
          this.createPlaceholderMesh(x, y);
        }
      }
    }
  }

  createPlaceholderMesh(x, y) {
    const geometry = new THREE.PlaneGeometry(this.photoSize, this.photoSize);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: null },
        diffuse: { value: new THREE.Color(0x333333) },
        opacity: { value: 0.8 },
        clipRadius: { value: this.clipRadius },
        hasTexture: { value: false }
      },
      vertexShader: CircleClipShader.vertexShader,
      fragmentShader: CircleClipShader.fragmentShader,
      transparent: true,
      side: THREE.DoubleSide
    });

    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, 0);
    this.scene.add(mesh);
    this.photoMeshes.push(mesh);
  }

  async uploadFiles(files) {
    const validFiles = Array.from(files).filter(file =>
      file.type.startsWith('image/')
    );

    if (validFiles.length === 0) {
      this.showToast('请选择有效的图片文件', 'error');
      return;
    }

    const progressEl = document.getElementById('upload-progress');
    const progressFill = document.getElementById('progress-fill');
    const progressText = document.getElementById('progress-text');

    progressEl.classList.remove('hidden');

    let uploaded = 0;
    const total = validFiles.length;

    for (const file of validFiles) {
      try {
        const formData = new FormData();
        formData.append('photo', file);

        const response = await fetch('/api/photos', {
          method: 'POST',
          body: formData
        });

        const data = await response.json();

        if (data.success) {
          uploaded++;
          const progress = (uploaded / total) * 100;
          progressFill.style.width = `${progress}%`;
          progressText.textContent = `上传中... ${uploaded}/${total}`;

          this.photos.unshift(data.photo);
        } else {
          console.error('上传失败:', data.error);
        }
      } catch (error) {
        console.error('上传错误:', error);
      }
    }

    progressEl.classList.add('hidden');
    progressFill.style.width = '0%';

    this.updatePhotoCount(this.photos.length);
    this.createPhotoCircle();
    this.showToast(`成功上传 ${uploaded} 张照片`, 'success');

    document.getElementById('file-input').value = '';
  }

  updatePhotoCount(count) {
    document.getElementById('photo-count').textContent = count;
  }

  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;

    setTimeout(() => toast.classList.add('visible'), 10);

    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.classList.add('hidden'), 300);
    }, 3000);
  }

  hideLoading() {
    const loading = document.getElementById('loading');
    loading.classList.add('hidden');
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  new PhotoGallery();
});
