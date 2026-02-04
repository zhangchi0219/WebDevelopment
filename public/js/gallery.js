/**
 * 3D 照片画廊
 * 使用 Three.js 将照片排列成圆形展示
 */

class PhotoGallery {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.photoMeshes = [];
    this.textureLoader = new THREE.TextureLoader();
    this.photos = [];
    this.radius = 15; // 圆形半径
    this.photoSize = 2; // 照片大小

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
    this.camera.position.set(0, 0, 30);
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
    // 环境光
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    this.scene.add(ambientLight);

    // 点光源
    const pointLight1 = new THREE.PointLight(0x4a9eff, 0.8, 100);
    pointLight1.position.set(20, 20, 20);
    this.scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0x6c5ce7, 0.8, 100);
    pointLight2.position.set(-20, -20, 20);
    this.scene.add(pointLight2);
  }

  setupEventListeners() {
    // 窗口大小调整
    window.addEventListener('resize', () => this.onWindowResize());

    // 上传区域事件
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

    // 面板切换
    const toggleBtn = document.getElementById('toggle-panel');
    const panel = document.getElementById('upload-panel');

    toggleBtn.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
      toggleBtn.textContent = panel.classList.contains('collapsed') ? '展开面板' : '收起面板';
    });

    // 鼠标交互时暂停自动旋转
    this.renderer.domElement.addEventListener('mousedown', () => {
      this.controls.autoRotate = false;
    });

    this.renderer.domElement.addEventListener('mouseup', () => {
      setTimeout(() => {
        this.controls.autoRotate = true;
      }, 3000);
    });
  }

  onWindowResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
  }

  async loadPhotos() {
    try {
      const response = await fetch('/api/photos?limit=200');
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

  createPhotoCircle() {
    // 清除现有照片
    this.photoMeshes.forEach(mesh => this.scene.remove(mesh));
    this.photoMeshes = [];

    if (this.photos.length === 0) {
      this.createPlaceholder();
      return;
    }

    const count = this.photos.length;

    // 动态调整圆形参数
    // 根据照片数量计算需要多少圈
    const photosPerRing = Math.ceil(Math.sqrt(count) * 2);
    const rings = Math.ceil(count / photosPerRing);

    let photoIndex = 0;

    for (let ring = 0; ring < rings && photoIndex < count; ring++) {
      const ringRadius = this.radius + ring * (this.photoSize + 0.5);
      const photosInThisRing = Math.min(
        Math.floor(2 * Math.PI * ringRadius / (this.photoSize + 0.3)),
        count - photoIndex
      );

      for (let i = 0; i < photosInThisRing && photoIndex < count; i++) {
        const angle = (i / photosInThisRing) * Math.PI * 2;
        const photo = this.photos[photoIndex];

        this.createPhotoMesh(photo, ringRadius, angle, ring);
        photoIndex++;
      }
    }
  }

  createPhotoMesh(photo, radius, angle, ringIndex) {
    // 创建照片平面
    const geometry = new THREE.PlaneGeometry(this.photoSize, this.photoSize);

    // 创建加载中的材质
    const material = new THREE.MeshStandardMaterial({
      color: 0x333333,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
    });

    const mesh = new THREE.Mesh(geometry, material);

    // 计算位置 (XY 平面上的圆形)
    const x = Math.cos(angle) * radius;
    const y = Math.sin(angle) * radius;
    const z = ringIndex * 0.1; // 稍微偏移z轴，避免重叠

    mesh.position.set(x, y, z);

    // 让照片面向圆心
    mesh.lookAt(0, 0, z);
    mesh.rotateY(Math.PI); // 翻转使正面朝外

    this.scene.add(mesh);
    this.photoMeshes.push(mesh);

    // 异步加载纹理
    this.textureLoader.load(
      photo.url,
      (texture) => {
        texture.minFilter = THREE.LinearFilter;
        texture.magFilter = THREE.LinearFilter;

        // 计算纹理的宽高比
        const imgAspect = texture.image.width / texture.image.height;

        // 更新几何体以保持图片比例
        const newGeometry = imgAspect > 1
          ? new THREE.PlaneGeometry(this.photoSize, this.photoSize / imgAspect)
          : new THREE.PlaneGeometry(this.photoSize * imgAspect, this.photoSize);

        mesh.geometry.dispose();
        mesh.geometry = newGeometry;

        // 更新材质
        mesh.material.map = texture;
        mesh.material.color.set(0xffffff);
        mesh.material.needsUpdate = true;

        // 添加淡入效果
        mesh.material.opacity = 0;
        this.fadeIn(mesh);
      },
      undefined,
      (error) => {
        console.warn('纹理加载失败:', photo.url);
      }
    );
  }

  fadeIn(mesh, duration = 500) {
    const startTime = Date.now();
    const animate = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(elapsed / duration, 1);
      mesh.material.opacity = progress * 0.95;

      if (progress < 1) {
        requestAnimationFrame(animate);
      }
    };
    animate();
  }

  createPlaceholder() {
    // 创建占位提示
    const geometry = new THREE.RingGeometry(this.radius - 1, this.radius + 1, 64);
    const material = new THREE.MeshBasicMaterial({
      color: 0x333333,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.3
    });
    const ring = new THREE.Mesh(geometry, material);
    this.scene.add(ring);
    this.photoMeshes.push(ring);

    // 添加文字提示 (使用精灵)
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.font = '32px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('上传照片开始创建画廊', 256, 70);

    const texture = new THREE.CanvasTexture(canvas);
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(15, 3.75, 1);
    sprite.position.set(0, 0, 1);
    this.scene.add(sprite);
    this.photoMeshes.push(sprite);
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

          // 添加新照片到数组开头
          this.photos.unshift(data.photo);
        } else {
          console.error('上传失败:', data.error);
        }
      } catch (error) {
        console.error('上传错误:', error);
      }
    }

    // 限制照片数量为200
    if (this.photos.length > 200) {
      this.photos = this.photos.slice(0, 200);
    }

    progressEl.classList.add('hidden');
    progressFill.style.width = '0%';

    this.updatePhotoCount(this.photos.length);
    this.createPhotoCircle();
    this.showToast(`成功上传 ${uploaded} 张照片`, 'success');

    // 清除文件输入
    document.getElementById('file-input').value = '';
  }

  updatePhotoCount(count) {
    document.getElementById('photo-count').textContent = count;
  }

  showToast(message, type = 'info') {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.className = `toast ${type}`;

    // 显示
    setTimeout(() => toast.classList.add('visible'), 10);

    // 隐藏
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

    // 更新控制器
    this.controls.update();

    // 渲染场景
    this.renderer.render(this.scene, this.camera);
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  new PhotoGallery();
});
