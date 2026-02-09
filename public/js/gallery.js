/**
 * 3D 照片画廊
 * 使用 Three.js 将照片排列成完美圆形展示
 */

// 圆形裁剪 Shader（带太阳色调）
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
    uniform float time;

    varying vec2 vUv;
    varying vec3 vWorldPosition;

    void main() {
      // 计算到圆心的距离
      float dist = length(vWorldPosition.xy);
      float normalizedDist = dist / clipRadius;

      // 圆形裁剪
      if (normalizedDist > 1.0) {
        discard;
      }

      // 指数周期性亮度变化
      float pulse = sin(time * 0.8) * 0.5 + 0.5;
      float brightness = 1.2 + pow(pulse, 2.0) * 0.8;

      // 太阳颜色渐变
      vec3 sunCore = vec3(1.0, 0.98, 0.9);    // 中心近白色
      vec3 sunMid = vec3(1.0, 0.85, 0.4);     // 亮黄色
      vec3 sunOuter = vec3(1.0, 0.5, 0.2);    // 橙色
      vec3 sunEdge = vec3(0.9, 0.3, 0.1);     // 橙红色
      vec3 coronaColor = vec3(1.0, 0.6, 0.2); // 边缘光晕颜色

      vec3 sunTint = mix(sunCore, sunMid, smoothstep(0.0, 0.4, normalizedDist));
      sunTint = mix(sunTint, sunOuter, smoothstep(0.3, 0.7, normalizedDist));
      sunTint = mix(sunTint, sunEdge, smoothstep(0.6, 0.95, normalizedDist));

      // 临边昏暗效果 (limb darkening)
      float limbDarkening = 1.0 - pow(normalizedDist, 2.0) * 0.3;

      // 中心光晕
      float centerGlow = pow(1.0 - normalizedDist, 3.0) * 0.5;
      centerGlow *= 1.0 + pow(pulse, 2.0) * 0.5;

      // 边缘发光 (模拟日冕效果)
      float edgeGlow = pow(smoothstep(0.6, 1.0, normalizedDist), 1.5) * 1.2;
      edgeGlow *= 1.0 + pulse * 0.5;

      // 统一的太阳色调
      vec3 baseTint = sunTint * brightness * limbDarkening;
      vec3 glowEffect = sunCore * centerGlow + coronaColor * edgeGlow;

      // 获取基础颜色
      vec3 baseColor;
      if (hasTexture) {
        baseColor = texture2D(map, vUv).rgb;
      } else {
        baseColor = vec3(0.5); // 占位符用中灰色
      }

      // 统一应用太阳效果
      vec4 color;
      color.rgb = baseColor * baseTint + glowEffect;
      color.a = opacity;

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
    this.clock = new THREE.Clock(); // 用于动画时间

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
    const expandBtn = document.getElementById('expand-panel');

    toggleBtn.addEventListener('click', () => {
      panel.classList.add('collapsed');
      expandBtn.classList.add('visible');
    });

    expandBtn.addEventListener('click', () => {
      panel.classList.remove('collapsed');
      expandBtn.classList.remove('visible');
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

    // 管理员面板
    const openAdminBtn = document.getElementById('open-admin');
    const closeAdminBtn = document.getElementById('close-admin');
    const adminPanel = document.getElementById('admin-panel');

    openAdminBtn.addEventListener('click', () => {
      adminPanel.classList.add('visible');
      this.renderAdminPhotoGrid();
    });

    closeAdminBtn.addEventListener('click', () => {
      adminPanel.classList.remove('visible');
    });

    // 数据库模态框
    const openDbBtn = document.getElementById('open-database');
    const closeDbBtn = document.getElementById('close-database');
    const dbModal = document.getElementById('database-modal');

    openDbBtn.addEventListener('click', () => {
      this.openDatabaseModal();
    });

    closeDbBtn.addEventListener('click', () => {
      this.closeDatabaseModal();
    });

    dbModal.addEventListener('click', (e) => {
      if (e.target === dbModal) {
        this.closeDatabaseModal();
      }
    });

    // 二维码模态框
    const showQrcodeBtn = document.getElementById('show-qrcode');
    const closeQrcodeBtn = document.getElementById('close-qrcode');
    const qrcodeModal = document.getElementById('qrcode-modal');

    showQrcodeBtn.addEventListener('click', () => {
      this.showQrcodeModal();
    });

    closeQrcodeBtn.addEventListener('click', () => {
      this.closeQrcodeModal();
    });

    qrcodeModal.addEventListener('click', (e) => {
      if (e.target === qrcodeModal) {
        this.closeQrcodeModal();
      }
    });
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
        this.renderAdminPhotoGrid();
        this.showToast('所有照片已清除', 'success');
      } else {
        this.showToast('清除失败', 'error');
      }
    } catch (error) {
      console.error('清除照片错误:', error);
      this.showToast('清除失败', 'error');
    }
  }

  renderAdminPhotoGrid() {
    const grid = document.getElementById('photo-grid');
    const countEl = document.getElementById('admin-photo-count');

    countEl.textContent = this.photos.length;

    if (this.photos.length === 0) {
      grid.innerHTML = '<div class="photo-grid-empty">暂无照片</div>';
      return;
    }

    grid.innerHTML = this.photos.map(photo => `
      <div class="photo-item" data-id="${photo.id}">
        <img src="${photo.url}" alt="${photo.original_name || '照片'}" loading="lazy">
        <button class="delete-btn" title="删除照片">&times;</button>
      </div>
    `).join('');

    // 添加点击事件
    grid.querySelectorAll('.photo-item').forEach(item => {
      const img = item.querySelector('img');
      const deleteBtn = item.querySelector('.delete-btn');
      const photoId = item.dataset.id;
      const photo = this.photos.find(p => p.id === photoId);

      img.addEventListener('click', () => {
        if (photo) this.openLightbox(photo);
      });

      deleteBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.deletePhoto(photoId);
      });
    });
  }

  async deletePhoto(photoId) {
    if (!confirm('确定要删除这张照片吗？')) {
      return;
    }

    try {
      const response = await fetch(`/api/photos/${photoId}`, {
        method: 'DELETE'
      });
      const data = await response.json();

      if (data.success) {
        this.photos = this.photos.filter(p => p.id !== photoId);
        this.updatePhotoCount(this.photos.length);
        this.createPhotoCircle();
        this.renderAdminPhotoGrid();
        this.showToast('照片已删除', 'success');
      } else {
        this.showToast('删除失败', 'error');
      }
    } catch (error) {
      console.error('删除照片错误:', error);
      this.showToast('删除失败', 'error');
    }
  }

  async openDatabaseModal() {
    const modal = document.getElementById('database-modal');
    const tbody = document.getElementById('database-tbody');

    // 显示模态框
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.add('visible'), 10);

    // 加载数据
    tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px;">加载中...</td></tr>';

    try {
      const response = await fetch('/api/photos?limit=1000');
      const data = await response.json();

      if (data.success && data.photos.length > 0) {
        tbody.innerHTML = data.photos.map(photo => `
          <tr>
            <td class="id-col" title="${photo.id}">${photo.id}</td>
            <td>${photo.filename}</td>
            <td>${photo.original_name || '-'}</td>
            <td>${photo.mimetype}</td>
            <td class="size-col">${this.formatFileSize(photo.size)}</td>
            <td class="date-col">${this.formatDate(photo.created_at)}</td>
          </tr>
        `).join('');
      } else {
        tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: rgba(255,255,255,0.4);">暂无数据</td></tr>';
      }
    } catch (error) {
      console.error('加载数据库错误:', error);
      tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; padding: 40px; color: #e74c3c;">加载失败</td></tr>';
    }
  }

  closeDatabaseModal() {
    const modal = document.getElementById('database-modal');
    modal.classList.remove('visible');
    setTimeout(() => modal.classList.add('hidden'), 300);
  }

  formatFileSize(bytes) {
    if (!bytes) return '-';
    const units = ['B', 'KB', 'MB', 'GB'];
    let unitIndex = 0;
    let size = bytes;
    while (size >= 1024 && unitIndex < units.length - 1) {
      size /= 1024;
      unitIndex++;
    }
    return `${size.toFixed(1)} ${units[unitIndex]}`;
  }

  formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    return date.toLocaleString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });
  }

  showQrcodeModal() {
    const modal = document.getElementById('qrcode-modal');
    const container = document.getElementById('qrcode-container');
    const urlEl = document.getElementById('qrcode-url');

    // 生成上传页面 URL
    const uploadUrl = `${window.location.protocol}//${window.location.host}/upload.html`;
    urlEl.textContent = uploadUrl;

    // 清空并生成新的二维码
    container.innerHTML = '';
    new QRCode(container, {
      text: uploadUrl,
      width: 200,
      height: 200,
      colorDark: '#000000',
      colorLight: '#ffffff',
      correctLevel: QRCode.CorrectLevel.H
    });

    // 显示模态框
    modal.classList.remove('hidden');
    setTimeout(() => modal.classList.add('visible'), 10);
  }

  closeQrcodeModal() {
    const modal = document.getElementById('qrcode-modal');
    modal.classList.remove('visible');
    setTimeout(() => modal.classList.add('hidden'), 300);
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

    // 始终使用默认网格大小
    this.gridSize = DEFAULT_GRID_SIZE;
    this.clipRadius = (this.gridSize * this.photoSize) / 2 - 0.01;

    const halfGrid = (this.gridSize - 1) / 2;
    const photoCount = this.photos.length;
    let photoIndex = 0;

    // 收集所有在圆形范围内的位置
    const positions = [];
    for (let row = 0; row < this.gridSize; row++) {
      for (let col = 0; col < this.gridSize; col++) {
        const x = (col - halfGrid) * this.photoSize;
        const y = (halfGrid - row) * this.photoSize;

        const dist = Math.sqrt(x * x + y * y);
        if (dist < this.clipRadius + this.photoSize) {
          positions.push({ x, y });
        }
      }
    }

    // 为每个位置创建照片或占位符
    for (let i = 0; i < positions.length; i++) {
      const pos = positions[i];
      if (photoIndex < photoCount) {
        // 有照片，创建照片
        this.createPhotoMesh(this.photos[photoIndex], pos.x, pos.y);
        photoIndex++;
      } else {
        // 没有照片，创建占位符
        this.createPlaceholderMesh(pos.x, pos.y);
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
        hasTexture: { value: false },
        time: { value: 0.0 }
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
    // createPhotoCircle 会自动处理没有照片时显示全部占位符的情况
    this.createPhotoCircle();
  }

  createPlaceholderMesh(x, y) {
    const geometry = new THREE.PlaneGeometry(this.photoSize, this.photoSize);

    const material = new THREE.ShaderMaterial({
      uniforms: {
        map: { value: null },
        diffuse: { value: new THREE.Color(0x222222) },
        opacity: { value: 0.5 },
        clipRadius: { value: this.clipRadius },
        hasTexture: { value: false },
        time: { value: 0.0 }
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
    this.renderAdminPhotoGrid();
    this.showToast(`成功上传 ${uploaded} 张照片`, 'success');

    document.getElementById('file-input').value = '';
  }

  updatePhotoCount(count) {
    document.getElementById('photo-count').textContent = count;
    document.getElementById('admin-photo-count').textContent = count;
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

    // 更新所有网格的时间 uniform
    const time = this.clock.getElapsedTime();
    this.photoMeshes.forEach(mesh => {
      if (mesh.material.uniforms && mesh.material.uniforms.time) {
        mesh.material.uniforms.time.value = time;
      }
    });

    this.controls.update();
    this.renderer.render(this.scene, this.camera);
  }
}

// 初始化
document.addEventListener('DOMContentLoaded', () => {
  new PhotoGallery();
});
