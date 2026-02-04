/**
 * 3D 照片画廊
 * 使用 Three.js 将照片排列成圆形展示
 */

// 完美圆形照片数量表 (网格大小 -> 照片数)
const PERFECT_CIRCLE_COUNTS = [
  { grid: 3, count: 5 },
  { grid: 5, count: 13 },
  { grid: 7, count: 29 },
  { grid: 9, count: 49 },
  { grid: 11, count: 81 },
  { grid: 13, count: 113 },
  { grid: 15, count: 149 },
  { grid: 17, count: 197 },  // 默认推荐
  { grid: 19, count: 253 },
  { grid: 21, count: 317 },
  { grid: 23, count: 377 },
  { grid: 25, count: 441 },
  { grid: 27, count: 529 },
  { grid: 29, count: 613 },
  { grid: 31, count: 709 }
];

const DEFAULT_PHOTO_COUNT = 197; // 17x17 网格，完美圆形

class PhotoGallery {
  constructor() {
    this.scene = null;
    this.camera = null;
    this.renderer = null;
    this.controls = null;
    this.photoMeshes = [];
    this.circleMask = null;
    this.textureLoader = new THREE.TextureLoader();
    this.photos = [];
    this.photoSize = 2; // 照片大小
    this.diskRadius = 0; // 圆盘实际半径，动态计算
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.meshToPhoto = new Map(); // mesh 到 photo 的映射
    this.maxPhotos = DEFAULT_PHOTO_COUNT; // 默认最大照片数

    this.init();
  }

  // 根据照片数量找到最合适的完美圆形网格
  findPerfectCircleGrid(photoCount) {
    for (let i = PERFECT_CIRCLE_COUNTS.length - 1; i >= 0; i--) {
      if (PERFECT_CIRCLE_COUNTS[i].count <= photoCount) {
        return PERFECT_CIRCLE_COUNTS[i];
      }
    }
    return PERFECT_CIRCLE_COUNTS[0];
  }

  // 计算指定网格大小的完美圆形位置
  getCirclePositions(gridSize) {
    const positions = [];
    const halfGrid = (gridSize - 1) / 2;
    const radius = gridSize / 2;

    for (let row = 0; row < gridSize; row++) {
      for (let col = 0; col < gridSize; col++) {
        const x = col - halfGrid;
        const y = halfGrid - row;
        const dist = Math.sqrt(x * x + y * y);
        if (dist <= radius - 0.5) {
          positions.push({ x: x * this.photoSize, y: y * this.photoSize });
        }
      }
    }
    return positions;
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

    // 清除照片按钮
    const clearBtn = document.getElementById('clear-photos');
    clearBtn.addEventListener('click', () => this.clearAllPhotos());

    // 照片点击事件
    this.renderer.domElement.addEventListener('click', (e) => this.onPhotoClick(e));

    // 关闭大图预览
    const lightbox = document.getElementById('lightbox');
    lightbox.addEventListener('click', () => this.closeLightbox());
  }

  onPhotoClick(event) {
    // 计算鼠标位置
    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    // 射线检测
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

  createPhotoCircle() {
    // 清除现有照片和遮罩
    this.photoMeshes.forEach(mesh => this.scene.remove(mesh));
    this.photoMeshes = [];
    this.meshToPhoto.clear();
    if (this.circleMask) {
      this.scene.remove(this.circleMask);
      this.circleMask = null;
    }

    if (this.photos.length === 0) {
      this.createPlaceholder();
      return;
    }

    // 找到能容纳当前照片数量的最小完美圆形
    const perfectCircle = this.findPerfectCircleGrid(this.photos.length);
    const positions = this.getCirclePositions(perfectCircle.grid);

    // 只显示能填满完美圆形的照片数量
    const displayCount = Math.min(this.photos.length, perfectCircle.count);

    for (let i = 0; i < displayCount; i++) {
      this.createPhotoMesh(this.photos[i], positions[i].x, positions[i].y);
    }

    // 添加圆形遮罩
    const radius = (perfectCircle.grid * this.photoSize) / 2;
    this.diskRadius = radius;
    this.addCircleMask(this.diskRadius);
  }

  addCircleMask(radius) {
    // 创建一个大的环形遮罩，内圈是圆盘半径，外圈很大，颜色与背景相同
    const innerRadius = radius;
    const outerRadius = radius + 100;
    const geometry = new THREE.RingGeometry(innerRadius, outerRadius, 128);
    const material = new THREE.MeshBasicMaterial({
      color: 0x0a0a0a,
      side: THREE.DoubleSide
    });
    this.circleMask = new THREE.Mesh(geometry, material);
    this.circleMask.position.z = 0.01;
    this.scene.add(this.circleMask);
  }

  createPhotoMesh(photo, x, y) {
    // 创建照片平面 - 1:1 正方形缩略图
    const geometry = new THREE.PlaneGeometry(this.photoSize, this.photoSize);

    // 创建加载中的材质
    const material = new THREE.MeshStandardMaterial({
      color: 0x333333,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9
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
          // 横图：裁剪左右
          texture.repeat.set(1 / imgAspect, 1);
          texture.offset.set((1 - 1 / imgAspect) / 2, 0);
        } else {
          // 竖图：裁剪上下
          texture.repeat.set(1, imgAspect);
          texture.offset.set(0, (1 - imgAspect) / 2);
        }

        mesh.material.map = texture;
        mesh.material.color.set(0xffffff);
        mesh.material.needsUpdate = true;

        // 淡入效果
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
    // 清除遮罩
    if (this.circleMask) {
      this.scene.remove(this.circleMask);
      this.circleMask = null;
    }

    // 使用默认完美圆形 (17x17 = 197张)
    const positions = this.getCirclePositions(17);

    for (const pos of positions) {
      this.createPlaceholderMesh(pos.x, pos.y);
    }

    // 添加圆形遮罩
    const radius = (17 * this.photoSize) / 2;
    this.diskRadius = radius;
    this.addCircleMask(this.diskRadius);
  }

  createPlaceholderMesh(x, y) {
    const geometry = new THREE.PlaneGeometry(this.photoSize, this.photoSize);
    const material = new THREE.MeshStandardMaterial({
      color: 0x333333,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.8
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

          // 添加新照片到数组开头
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
