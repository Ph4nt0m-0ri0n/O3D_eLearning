  import * as THREE from 'three';
  import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls';
  import { FlyControls } from 'three/examples/jsm/controls/FlyControls';
  import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
  import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader';
  import { GLTFAnimationPointerExtension } from '@needle-tools/three-animation-pointer';
  fetch('ui.html')
      .then(response => response.text())
      .then(html => {
          document.getElementById('uiContainer').innerHTML = html;
          init();
          setTimeout(postInit, 100);
      })
      .catch(error => console.error('Failed to load ui.html:', error));

      let scene, camera, renderer, orbitControls, flyControls, controls, mixer = null, clock, currentModel, actions = {}, activeAction;
      let gradientCanvas, gradientCtx, gradientType = "linear", gradientColor1 = "#000000", gradientColor2 = "#1F1F1F";
      let raycaster = new THREE.Raycaster();
      let mouse = new THREE.Vector2();
      let selectedObject = null;
      let lastTapTime = 0;
      let isMultiTouch = false;
      const doubleTapThreshold = 300;
      let annotations = [];
      let perspectiveCamera, orthographicCamera;
      let outlineMesh = null;
      let originalMaterials = new Map();
      let areDimensionsVisible = false;
      let haloGroups = new Map();
      let isFlyMode = false;
      const pitchLimit = 54 * (Math.PI / 180);

  function init() {
          scene = new THREE.Scene();
          gradientCanvas = document.createElement("canvas");
          gradientCtx = gradientCanvas.getContext("2d");
          gradientCanvas.width = 512;
          gradientCanvas.height = 512;

          perspectiveCamera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
          orthographicCamera = new THREE.OrthographicCamera(
              window.innerWidth / -2, window.innerWidth / 2,
              window.innerHeight / 2, window.innerHeight / -2,
              0.1, 1000
          );
          camera = perspectiveCamera;

          renderer = new THREE.WebGLRenderer({ antialias: true });
          renderer.setSize(window.innerWidth, window.innerHeight);
          renderer.toneMapping = THREE.ACESFilmicToneMapping;
          renderer.toneMappingExposure = 0.5;
          renderer.xr.enabled = true; // Required for WebXR AR
          document.body.appendChild(renderer.domElement);

          const ambientLight = new THREE.AmbientLight(0xffffff, 1);
          scene.add(ambientLight);
          const directionalLight = new THREE.DirectionalLight(0xffffff, 0);
          directionalLight.position.set(5, 10, 7.5);
          scene.add(directionalLight);

          orbitControls = new OrbitControls(camera, renderer.domElement);
          orbitControls.enableDamping = true;
          orbitControls.dampingFactor = 0.05;
          camera.position.set(2, 2, 5);
          orbitControls.update();

          flyControls = new FlyControls(camera, renderer.domElement);
          flyControls.movementSpeed = 10;
          flyControls.rollSpeed = Math.PI / 24;
          flyControls.autoForward = false;
          flyControls.dragToLook = true;
          flyControls.enabled = false;
          controls = orbitControls;

          window.addEventListener('resize', () => {
              renderer.setSize(window.innerWidth, window.innerHeight);
              if (camera === perspectiveCamera) {
                  camera.aspect = window.innerWidth / window.innerHeight;
                  camera.updateProjectionMatrix();
              } else {
                  camera.left = window.innerWidth / -2;
                  camera.right = window.innerWidth / 2;
                  camera.top = window.innerHeight / 2;
                  camera.bottom = -window.innerHeight / 2;
                  camera.updateProjectionMatrix();
              }
          });

          clock = new THREE.Clock();
      }
  function updateGradient() {
      gradientCtx.clearRect(0, 0, 512, 512);
      if (gradientType === "solid") {
          gradientCtx.fillStyle = gradientColor1;
          gradientCtx.fillRect(0, 0, 512, 512);
      } else {
          let gradient;
          if (gradientType === "radial") {
              gradient = gradientCtx.createRadialGradient(256, 256, 50, 256, 256, 256);
          } else {
              gradient = gradientCtx.createLinearGradient(0, 0, 512, 512);
          }
          gradient.addColorStop(0, gradientColor1);
          gradient.addColorStop(1, gradientColor2);
          gradientCtx.fillStyle = gradient;
          gradientCtx.fillRect(0, 0, 512, 512);
      }
      scene.background = new THREE.CanvasTexture(gradientCanvas);
  }

  function updateColorInputs() {
      const color1Container = document.getElementById('gradientColor1Container');
      const color2Container = document.getElementById('gradientColor2Container');
      const color1Label = document.getElementById('gradientColor1Label');
      const color2Label = document.getElementById('gradientColor2Label');

      if (!color1Container || !color2Container || !color1Label || !color2Label) {
          console.error('Color container or label not found');
          return;
      }

      if (gradientType === "solid") {
          color1Label.textContent = "Color 1:";
          color1Container.style.display = "inline-block";
          color2Container.style.display = "none";
      } else {
          color1Label.textContent = "Color 1:";
          color2Label.textContent = "Color 2:";
          color1Container.style.display = "inline-block";
          color2Container.style.display = "inline-block";
      }
  }

  function clampCameraPitch() {
      const euler = new THREE.Euler().setFromQuaternion(camera.quaternion, 'YXZ');
      euler.x = Math.max(-pitchLimit, Math.min(pitchLimit, euler.x));
      camera.quaternion.setFromEuler(euler);
  }
  function setupMaterialPanel() {
      const materialList = document.getElementById('materialList');
      if (!materialList) return;

      materialList.innerHTML = '';

      const industrialMaterials = [
          {
              name: 'Stainless Steel (Brushed)',
              material: new THREE.MeshStandardMaterial({
                  color: 0xaaaaaa,
                  metalness: 0.9,
                  roughness: 0.3,
                  envMapIntensity: 1.0
              })
          },
          {
              name: 'Stainless Steel (Mirror Polished)',
              material: new THREE.MeshStandardMaterial({
                  color: 0xdddddd,
                  metalness: 1.0,
                  roughness: 0.0,
                  envMapIntensity: 1.5
              })
          },
          {
              name: 'Matte Steel (Industrial)',
              material: new THREE.MeshStandardMaterial({
                  color: 0x888888,
                  metalness: 0.8,
                  roughness: 0.7
              })
          },
          {
              name: 'Carbon Steel (Raw)',
              material: new THREE.MeshStandardMaterial({
                  color: 0x555555,
                  metalness: 0.6,
                  roughness: 0.8
              })
          },
          {
              name: 'FRP (Fiberglass)',
              material: new THREE.MeshStandardMaterial({
                  color: 0xa0d0a0,
                  metalness: 0.0,
                  roughness: 0.6
              })
          },
          {
              name: 'PTFE (Teflon White)',
              material: new THREE.MeshStandardMaterial({
                  color: 0xf0f0f0,
                  metalness: 0.0,
                  roughness: 0.4
              })
          },
          {
              name: 'Aluminum (Anodized)',
              material: new THREE.MeshStandardMaterial({
                  color: 0xcccccc,
                  metalness: 0.8,
                  roughness: 0.2
              })
          },
          {
              name: 'Copper (Polished)',
              material: new THREE.MeshStandardMaterial({
                  color: 0xb87333,
                  metalness: 1.0,
                  roughness: 0.1
              })
          },
          {
              name: 'Brass',
              material: new THREE.MeshStandardMaterial({
                  color: 0xb5a642,
                  metalness: 1.0,
                  roughness: 0.3
              })
          },
          {
              name: 'Black Anodized',
              material: new THREE.MeshStandardMaterial({
                  color: 0x222222,
                  metalness: 0.9,
                  roughness: 0.4
              })
          }
      ];

      industrialMaterials.forEach((matOption) => {
          const button = document.createElement('button');
          button.className = 'material-btn';
          button.textContent = matOption.name;
          button.onclick = () => applyMaterialToSelected(matOption.material);
          materialList.appendChild(button);
      });
      const restoreButton = document.createElement('button');
    restoreButton.className = 'material-btn';
    restoreButton.textContent = 'Restore Original';
    restoreButton.style.marginTop = '16px'; // Space above it
    restoreButton.style.background = 'rgba(255, 255, 255, 0.08)'; // Slightly different look
    restoreButton.onclick = () => {
        if (!selectedObject || !originalMaterials.has(selectedObject)) {
            alert('No original material saved or no mesh selected.');
            return;
        }
        selectedObject.material = originalMaterials.get(selectedObject);
        selectedObject.material.needsUpdate = true;
        // Optional: remove from map after restore
        originalMaterials.delete(selectedObject);
    };
    materialList.appendChild(restoreButton);
}
  function applyMaterialToSelected(newMaterial) {
      if (!selectedObject || !selectedObject.isMesh) {
          alert('Please select a mesh first!');
          return;
      }

      // Save original (safe for all these materials)
      if (!originalMaterials.has(selectedObject)) {
          originalMaterials.set(selectedObject, selectedObject.material);
      }

      selectedObject.material = newMaterial.clone();
      selectedObject.material.needsUpdate = true;
  }
  function postInit() {
      updateGradient();
      updateColorInputs();
      setupMaterialPanel();

      const buttons = ['hideButton', 'showButton', 'xrayButton', 'dimensionsButton', 'flyModeButton'];
      buttons.forEach(id => {

      });

      const addListener = (id, event, handler) => {
          const element = document.getElementById(id);
          if (element) {
              element.addEventListener(event, handler);
          } else {
              console.error(`Element with ID '${id}' not found`);
          }
      };

      // Initialize video and image overlays to be visible but empty
      const videoOverlay = document.getElementById('videoOverlay');
      const videoContainer = document.getElementById('videoContainer');
      if (videoOverlay && videoContainer) {
          videoOverlay.style.display = 'block';
          videoContainer.innerHTML = ''; // Keep empty initially
      }

      // Create and display empty image overlay
      const imageOverlay = document.createElement('div');
      imageOverlay.id = 'imageOverlay';
      imageOverlay.className = 'overlay';
      imageOverlay.style.display = 'block';
      const closeButton = document.createElement('span');
      closeButton.innerText = 'X';
      closeButton.className = 'close-icon';
      closeButton.onclick = () => {
          imageOverlay.innerHTML = ''; // Clear content but keep overlay visible
          imageOverlay.appendChild(closeButton); // Re-append close button
          imageOverlay.style.display = 'block';
      };
      imageOverlay.appendChild(closeButton);
      document.getElementById('uiContainer').appendChild(imageOverlay);

      addListener('flyModeButton', 'click', () => {
          isFlyMode = !isFlyMode;
          const flyModeButton = document.getElementById('flyModeButton');
          if (isFlyMode) {
              camera = perspectiveCamera;
              orbitControls.enabled = false;
              flyControls.enabled = true;
              controls = flyControls;
              flyModeButton.textContent = 'Orbit';
              flyModeButton.classList.add('active');
              orbitControls.enableRotate = true;
          } else {
              orbitControls.enabled = true;
              flyControls.enabled = false;
              controls = orbitControls;
              flyModeButton.textContent = 'Fly';
              flyModeButton.classList.remove('active');
              resetPerspectiveView();
          }
      });

      addListener('exposure', 'input', (e) => {
          renderer.toneMappingExposure = parseFloat(e.target.value);
      });

      addListener('gradientRadial', 'click', () => {
          gradientType = 'radial';
          updateGradient();
          updateColorInputs();
          highlightActiveGradient('gradientRadial');
      });
      addListener('gradientLinear', 'click', () => {
          gradientType = 'linear';
          updateGradient();
          updateColorInputs();
          highlightActiveGradient('gradientLinear');
      });
      addListener('gradientSolid', 'click', () => {
          gradientType = 'solid';
          updateGradient();
          updateColorInputs();
          highlightActiveGradient('gradientSolid');
      });

      highlightActiveGradient('gradientRadial');

      addListener('gradientColor1', 'input', (e) => {
          gradientColor1 = e.target.value;
          updateGradient();
      });
      addListener('gradientColor2', 'input', (e) => {
          gradientColor2 = e.target.value;
          updateGradient();
      });
      // Gear button click toggle
      addListener('gearButton', 'click', (e) => {
          e.stopPropagation(); // Prevent closing from document click
          const dropdown = document.getElementById('dropdownContent');
          dropdown.classList.toggle('open');
      });

      // Close dropdown when clicking outside
      document.addEventListener('click', (e) => {
          const dropdown = document.getElementById('dropdownContent');
          const gear = document.getElementById('gearButton');
          if (!gear.contains(e.target) && !dropdown.contains(e.target)) {
              dropdown.classList.remove('open');
          }
      });
      addListener('fileInput', 'change', function (event) {
          const file = event.target.files[0];
          if (file) {
              const url = URL.createObjectURL(file);
              loadGLTFModel(url);
          }
      });

      addListener('hdriInput', 'change', function (event) {
          const file = event.target.files[0];
          if (file) {
              const url = URL.createObjectURL(file);
              new RGBELoader().load(url, function (texture) {
                  texture.mapping = THREE.EquirectangularReflectionMapping;
                  const pmremGenerator = new THREE.PMREMGenerator(renderer);
                  pmremGenerator.compileEquirectangularShader();
                  const envMap = pmremGenerator.fromEquirectangular(texture).texture;
                  pmremGenerator.dispose();
                  texture.dispose();
                  scene.environment = envMap;
                  scene.background = new THREE.CanvasTexture(gradientCanvas);
              });
          }
      });
      addListener('loadModelBtn', 'click', () => {
          document.getElementById('fileInput').click();
      });

      addListener('loadHdriBtn', 'click', () => {
          document.getElementById('hdriInput').click();
      });
      addListener('showAllButton', 'click', () => {
          if (currentModel) {
              currentModel.traverse(node => {
                  if (node.isMesh) {
                      node.visible = true;
                      if (originalMaterials.has(node)) {
                          node.material = originalMaterials.get(node);
                          node.material.needsUpdate = true;
                      }
                  }
              });
              originalMaterials.clear();
              areDimensionsVisible = false;
              toggleDimensionsVisibility();
              document.getElementById('dimensionsButton').textContent = 'Dimension';
          }
      });

      addListener('toggleVisibilityButton', 'click', () => {
          if (!selectedObject || !selectedObject.isMesh) {
              return; // Nothing selected
          }

          const button = document.getElementById('toggleVisibilityButton');

          if (selectedObject.visible) {
              // Currently visible → Hide it
              if (!originalMaterials.has(selectedObject)) {
                  originalMaterials.set(selectedObject, selectedObject.material);
              }
              selectedObject.visible = false;
              button.textContent = 'Show';
          } else {
              // Currently hidden → Show it
              selectedObject.visible = true;
              if (originalMaterials.has(selectedObject)) {
                  selectedObject.material = originalMaterials.get(selectedObject);
                  selectedObject.material.needsUpdate = true;
              }
              button.textContent = 'Hide';
          }
      });

      addListener('xrayButton', 'click', () => {
          if (selectedObject && selectedObject.isMesh) {
              if (!originalMaterials.has(selectedObject)) {
                  originalMaterials.set(selectedObject, selectedObject.material);
              }
              const xrayMaterial = new THREE.MeshPhysicalMaterial({
                  color: 0xffffff,
                  transparent: true,
                  opacity: 0.5,
                  transmission: 0.5,
                  roughness: 0.1,
                  metalness: 0,
                  side: THREE.DoubleSide,
                  depthWrite: false,
                  alphaToCoverage: true,
                  renderOrder: 1
              });
              selectedObject.material = xrayMaterial;
              selectedObject.material.needsUpdate = true;
              selectedObject.visible = true;
          }
      });

      addListener('dimensionsButton', 'click', () => {
          areDimensionsVisible = !areDimensionsVisible;
          toggleDimensionsVisibility();
          document.getElementById('dimensionsButton').textContent = areDimensionsVisible ? 'Dimension' : 'Dimension';
      });

      addListener('frontView', 'click', () => setOrthographicView({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }));
      addListener('backView', 'click', () => setOrthographicView({ x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }));
      addListener('leftView', 'click', () => setOrthographicView({ x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }));
      addListener('rightView', 'click', () => setOrthographicView({ x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 }));
      addListener('topView', 'click', () => setOrthographicView({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }));
      addListener('bottomView', 'click', () => setOrthographicView({ x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }));
      addListener('resetView', 'click', resetPerspectiveView);

      renderer.domElement.addEventListener('click', (event) => {
          if (!isFlyMode) {
              handleHotspot(event.clientX, event.clientY);
          }
      });
      renderer.domElement.addEventListener('dblclick', (event) => {
          if (!isFlyMode) {
              handleHighlight(event.clientX, event.clientY);
          }
      });
      renderer.domElement.addEventListener('touchstart', (event) => {
          if (event.touches.length > 1) {
              isMultiTouch = true;
          } else {
              isMultiTouch = false;
          }
      });
      renderer.domElement.addEventListener('touchmove', (event) => {
          if (event.touches.length > 1) {
              isMultiTouch = true;
          }
      });
      renderer.domElement.addEventListener('touchend', (event) => {
          if (!isFlyMode) {
              const touch = event.changedTouches[0];
              const currentTime = Date.now();
              if (!isMultiTouch && currentTime - lastTapTime < doubleTapThreshold) {
                  handleHighlight(touch.clientX, touch.clientY);
              } else if (!isMultiTouch) {
                  handleHotspot(touch.clientX, touch.clientY);
              }
              lastTapTime = currentTime;
          }
          if (event.touches.length === 0) {
              isMultiTouch = false;
          }
      });

      renderer.domElement.addEventListener('mousedown', (event) => {
          if (isFlyMode && flyControls.enabled) {
              if (event.button === 0 || event.button === 2) {
                  flyControls.moveState.forward = 0;
                  flyControls.moveState.back = 0;
              }
          }
      });
      renderer.domElement.addEventListener('mouseup', (event) => {
          if (isFlyMode && flyControls.enabled) {
              if (event.button === 0 || event.button === 2) {
                  flyControls.moveState.forward = 0;
                  flyControls.moveState.back = 0;
              }
          }
      });

      window.addEventListener('keydown', (event) => {
          if (!isFlyMode || !flyControls.enabled) return;

          switch (event.keyCode) {
              case 81: // Q
                  event.preventDefault();
                  flyControls.moveState.rollLeft = 1;
                  flyControls.moveState.up = 0;
                  break;
              case 69: // E
                  event.preventDefault();
                  flyControls.moveState.rollRight = 1;
                  flyControls.moveState.down = 0;
                  break;
              case 82: // R
                  event.preventDefault();
                  flyControls.moveState.up = 1;
                  flyControls.moveState.rollLeft = 0;
                  break;
              case 70: // F
                  event.preventDefault();
                  flyControls.moveState.down = 1;
                  flyControls.moveState.rollRight = 0;
                  break;
          }
      });

      window.addEventListener('keyup', (event) => {
          if (!isFlyMode || !flyControls.enabled) return;

          switch (event.keyCode) {
              case 81: // Q
                  event.preventDefault();
                  flyControls.moveState.rollLeft = 0;
                  flyControls.moveState.up = 0;
                  break;
              case 69: // E
                  event.preventDefault();
                  flyControls.moveState.rollRight = 0;
                  flyControls.moveState.down = 0;
                  break;
              case 82: // R
                  event.preventDefault();
                  flyControls.moveState.up = 0;
                  flyControls.moveState.rollLeft = 0;
                  break;
              case 70: // F
                  event.preventDefault();
                  flyControls.moveState.down = 0;
                  flyControls.moveState.rollRight = 0;
                  break;
          }
      });

      addListener('closeText', 'click', () => {
          document.getElementById('textOverlay').style.display = 'none';
      });
      addListener('closeVideo', 'click', () => {
          videoContainer.innerHTML = ''; // Clear content but keep overlay visible
          videoOverlay.style.display = 'block';
      });
      addListener('playAnimation', 'click', playAnimation);
      addListener('pauseAnimation', 'click', pauseAnimation);
      addListener('reverseAnimation', 'click', reverseAnimation);
      addListener('animationSelectTrigger', 'click', toggleAnimationDropdown);
      addListener('animationTimeline', 'input', (e) => {
          if (activeAction) {
              const time = parseFloat(e.target.value);
              activeAction.time = time;
              if (mixer) mixer.update(0);
          }
      });

      document.addEventListener('click', (e) => {
          const dropdown = document.getElementById('animationOptionsDropdown');
          const trigger = document.getElementById('animationSelectTrigger');
          if (!trigger.contains(e.target) && !dropdown.contains(e.target)) {
              dropdown.style.display = 'none';
          }
      });
      animate();
      const canvas = renderer.domElement;

  // Visual feedback on drag over
  canvas.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      canvas.style.opacity = '0.7'; // Subtle feedback
      canvas.style.border = '4px dashed rgba(255, 255, 255, 0.5)';
  });

  canvas.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      canvas.style.opacity = '1';
      canvas.style.border = 'none';
  });

  canvas.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      canvas.style.opacity = '1';
      canvas.style.border = 'none';

      const file = e.dataTransfer.files[0];
      if (file && (file.name.toLowerCase().endsWith('.glb') || file.name.toLowerCase().endsWith('.gltf'))) {
          const url = URL.createObjectURL(file);
          loadGLTFModel(url);
      }
  });
  renderer.domElement.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      // Optional: subtle visual feedback
      renderer.domElement.style.opacity = '0.8';
  });

  renderer.domElement.addEventListener('dragleave', (e) => {
      e.preventDefault();
      e.stopPropagation();
      renderer.domElement.style.opacity = '1';
  });

  renderer.domElement.addEventListener('drop', (e) => {
      e.preventDefault();
      e.stopPropagation();
      renderer.domElement.style.opacity = '1';

      const file = e.dataTransfer.files[0];
      if (file) {
          if (file.name.toLowerCase().endsWith('.hdr')) {
              const url = URL.createObjectURL(file);
              new RGBELoader().load(url, (texture) => {
                  texture.mapping = THREE.EquirectangularReflectionMapping;

                  // Use PMREM for proper environment lighting (same as your hdriInput)
                  const pmremGenerator = new THREE.PMREMGenerator(renderer);
                  pmremGenerator.compileEquirectangularShader();
                  const envMap = pmremGenerator.fromEquirectangular(texture).texture;

                  scene.environment = envMap;
                  // Optional: keep your gradient background or replace it
                  // scene.background = envMap;  // Uncomment if you want HDRI as background too
                  scene.background = new THREE.CanvasTexture(gradientCanvas); // Keeps your custom gradient

                  pmremGenerator.dispose();
                  texture.dispose();

                  URL.revokeObjectURL(url); // Clean up
              });
          }
          // Your existing model drag & drop can stay separate or merged
      }
  });
  addListener('arButton', 'click', async () => {
          if (!currentModel) {
              alert('Load a model first!');
              return;
          }

          if (!navigator.xr) {
              alert('WebXR not supported on this browser/device');
              return;
          }

          try {
              const session = await navigator.xr.requestSession('immersive-ar', {
                  requiredFeatures: ['hit-test'],
                  optionalFeatures: ['dom-overlay'],
                  domOverlay: { root: document.body }
              });

              renderer.xr.setSession(session);

              // Reticle (white ring for floor detection)
              const reticleGeo = new THREE.RingGeometry(0.15, 0.2, 32).rotateX(-Math.PI / 2);
              const reticleMat = new THREE.MeshBasicMaterial({ color: 0xffffff, opacity: 0.5, transparent: true });
              const reticle = new THREE.Mesh(reticleGeo, reticleMat);
              reticle.matrixAutoUpdate = false;
              reticle.visible = false;
              scene.add(reticle);

              currentModel.visible = false; // Hide until placed

              let hitTestSource = null;
              let hitTestSourceRequested = false;

              const controller = renderer.xr.getController(0);
              scene.add(controller);

              controller.addEventListener('select', () => {
                  if (reticle.visible) {
                      currentModel.position.setFromMatrixPosition(reticle.matrix);
                      currentModel.visible = true;
                  }
              });

              renderer.setAnimationLoop((timestamp, frame) => {
                  if (!frame) return;

                  if (!hitTestSourceRequested) {
                      frame.session.requestReferenceSpace('viewer').then(refSpace => {
                          frame.session.requestHitTestSource({ space: refSpace }).then(source => {
                              hitTestSource = source;
                          });
                      });
                      hitTestSourceRequested = true;
                  }

                  if (hitTestSource) {
                      const hits = frame.getHitTestResults(hitTestSource);
                      if (hits.length) {
                          const hit = hits[0];
                          reticle.visible = true;
                          reticle.matrix.fromArray(hit.getPose(frame.session.requestReferenceSpace('local-floor') || frame.session.requestReferenceSpace('viewer')).transform.matrix);
                      } else {
                          reticle.visible = false;
                      }
                  }

                  if (mixer && activeAction) mixer.update(clock.getDelta());

                  renderer.render(scene, camera);
              });

          } catch (err) {
              console.error('AR failed:', err);
              alert('AR not available on this device');
          }
      });

      // Your other postInit listeners (visibility, xray, etc.) — keep them as is

      animate();
      addListener('screenshotButton', 'click', () => {
          const TARGET_WIDTH = 1920;
          const TARGET_HEIGHT = 1080;

          // Store original camera state
          const originalAspect = camera.aspect;
          const originalLeft = camera.left || 0;
          const originalRight = camera.right || 0;
          const originalTop = camera.top || 0;
          const originalBottom = camera.bottom || 0;

          // Temporarily resize main renderer to target resolution
          const originalSize = renderer.getSize(new THREE.Vector2());
          renderer.setSize(TARGET_WIDTH, TARGET_HEIGHT);

          // Update camera for target resolution
          if (camera.type === 'PerspectiveCamera') {
              camera.aspect = TARGET_WIDTH / TARGET_HEIGHT;
          } else { // Orthographic
              const aspect = TARGET_WIDTH / TARGET_HEIGHT;
              const frustumHeight = camera.top - camera.bottom;
              camera.left = -frustumHeight * aspect / 2;
              camera.right = frustumHeight * aspect / 2;
              camera.top = frustumHeight / 2;
              camera.bottom = -frustumHeight / 2;
          }
          camera.updateProjectionMatrix();

          if (controls) controls.update();

          // Render to main canvas at high res (captures HDRI perfectly since it uses main renderer + PMREM)
          renderer.render(scene, camera);

          // Read pixels from main canvas
          const pixelData = new Uint8Array(TARGET_WIDTH * TARGET_HEIGHT * 4);
          renderer.readRenderTargetPixels(renderer.getRenderTarget() || { width: TARGET_WIDTH, height: TARGET_HEIGHT }, 0, 0, TARGET_WIDTH, TARGET_HEIGHT, pixelData);
          // Actually, easier: use toDataURL on main canvas
          const screenshotDataUrl = renderer.domElement.toDataURL('image/png');

          // Restore original renderer size and camera
          renderer.setSize(originalSize.x, originalSize.y);
          camera.aspect = originalAspect;
          if (camera.type === 'OrthographicCamera') {
              camera.left = originalLeft;
              camera.right = originalRight;
              camera.top = originalTop;
              camera.bottom = originalBottom;
          }
          camera.updateProjectionMatrix();
          if (controls) controls.update();

          // Create canvas for watermark
          const finalCanvas = document.createElement('canvas');
          finalCanvas.width = TARGET_WIDTH;
          finalCanvas.height = TARGET_HEIGHT;
          const ctx = finalCanvas.getContext('2d');

          const img = new Image();
          img.src = screenshotDataUrl;
          img.onload = () => {
              ctx.drawImage(img, 0, 0);

              // Watermark
              const watermark = new Image();
              watermark.src = 'assets/watermark.png';
              watermark.onload = () => {
                  const scale = Math.max(finalCanvas.width / watermark.width, finalCanvas.height / watermark.height);
                  const w = watermark.width * scale;
                  const h = watermark.height * scale;
                  const x = (finalCanvas.width - w) / 2;
                  const y = (finalCanvas.height - h) / 2;

                  ctx.globalAlpha = 0.8;
                  ctx.drawImage(watermark, x, y, w, h);
                  ctx.globalAlpha = 1.0;

                  // Download
                  const link = document.createElement('a');
                  link.download = `olovi3d-screenshot-1920x1080-${new Date().toISOString().slice(0,10)}.png`;
                  link.href = finalCanvas.toDataURL('image/png');
                  link.click();
              };
              watermark.onerror = () => {
                  // Fallback without watermark
                  const link = document.createElement('a');
                  link.download = `olovi3d-screenshot-1920x1080-${new Date().toISOString().slice(0,10)}.png`;
                  link.href = screenshotDataUrl;
                  link.click();
              };
          };
      });
  }

  function highlightActiveGradient(activeId) {
      const options = ['gradientRadial', 'gradientLinear', 'gradientSolid'];
      options.forEach(id => {
          const element = document.getElementById(id);
          if (element) {
              if (id === activeId) {
                  element.classList.add('active');
              } else {
                  element.classList.remove('active');
              }
          }
      });
  }

  function toggleAnimationDropdown() {
      const dropdown = document.getElementById('animationOptionsDropdown');
      dropdown.style.display = dropdown.style.display === 'block' ? 'none' : 'block';
  }

  function toggleDimensionsVisibility() {
      if (currentModel) {
          currentModel.traverse(node => {
              if (node.isMesh && node.name.startsWith('Dimension_')) {
                  node.visible = areDimensionsVisible;
              }
          });
      }
  }

  function setupHaloEffect(mesh) {
      mesh.geometry.computeBoundingBox();
      const box = mesh.geometry.boundingBox;
      const size = new THREE.Vector3();
      box.getSize(size);
      const center = new THREE.Vector3();
      box.getCenter(center);
      const maxDim = Math.max(size.x, size.y);

      const haloGroup = new THREE.Group();
      haloGroup.name = `HaloGroup_${mesh.name}`;
      mesh.add(haloGroup);

      let numHalos;
      if (mesh.name === "hs_vid_1" || mesh.name === "hs_vid_local_1") {
          numHalos = 1;
      } else if (mesh.name === "hs_vid_2" || mesh.name === "hs_vid_local_2") {
          numHalos = 2;
      } else if (mesh.name === "hs_vid_3" || mesh.name === "hs_vid_local_3") {
          numHalos = 3;
      } else {
          numHalos = 3;
      }
      const baseRadius = maxDim * 0.5;
      const ringThickness = maxDim * 0.05;

      for (let i = 0; i < numHalos; i++) {
          const innerRadius = baseRadius;
          const outerRadius = innerRadius + ringThickness;
          const geometry = new THREE.RingGeometry(innerRadius, outerRadius, 64);
          const material = new THREE.MeshBasicMaterial({
              color: 0x189AB4,
              transparent: true,
              opacity: 0,
              side: THREE.DoubleSide,
              depthWrite: false
          });
          const halo = new THREE.Mesh(geometry, material);
          halo.rotation.x = Math.PI / 2;
          halo.position.set(center.x, center.y, center.z);
          halo.userData = {
              baseScale: 1,
              maxScale: 1.2,
              animationDuration: 0.5,
              haloIndex: i,
              numHalos: numHalos,
              animationTime: 0,
              isAnimating: false
          };
          haloGroup.add(halo);
      }

      haloGroups.set(mesh, haloGroup);
  }

  function updateHaloEffects(delta) {
      haloGroups.forEach((haloGroup, mesh) => {
          haloGroup.visible = mesh.visible;
          if (!haloGroup.visible) return;

          const totalCycleDuration = haloGroup.children.length > 0 ? haloGroup.children[0].userData.animationDuration * haloGroup.children.length : 0;
          let groupAnimationTime = (haloGroup.userData?.animationTime || 0) + delta;
          if (!haloGroup.userData) haloGroup.userData = {};
          haloGroup.userData.animationTime = totalCycleDuration > 0 ? groupAnimationTime % totalCycleDuration : 0;

          haloGroup.children.forEach(halo => {
              const { haloIndex, numHalos, animationDuration } = halo.userData;
              const startTime = (haloIndex * animationDuration);
              const endTime = startTime + animationDuration;
              const normalizedTime = totalCycleDuration > 0 ? groupAnimationTime % totalCycleDuration : 0;

              halo.userData.isAnimating = normalizedTime >= startTime && normalizedTime < endTime;

              if (!halo.userData.isAnimating) {
                  halo.scale.set(halo.userData.baseScale, halo.userData.baseScale, 1);
                  halo.material.opacity = 0;
                  return;
              }

              const progress = (normalizedTime - startTime) / animationDuration;
              const scale = THREE.MathUtils.lerp(halo.userData.baseScale, halo.userData.maxScale, progress);
              const opacity = THREE.MathUtils.lerp(1, 0, progress);
              halo.scale.set(scale, scale, 1);
              halo.material.opacity = opacity;
          });
      });
  }

  function loadGLTFModel(url) {
      const loader = new GLTFLoader();
      // Register the animation pointer extension (handles texture animation automatically)
      loader.register((parser) => new GLTFAnimationPointerExtension(parser));

      loader.load(url, function (gltf) {
          // Remove old model if exists
          if (currentModel) {
              scene.remove(currentModel);
              if (mixer) mixer.stopAllAction();
              actions = {};
          }

          currentModel = gltf.scene;
          scene.add(currentModel);

          // Setup animation mixer and UI
          mixer = new THREE.AnimationMixer(currentModel);

          // Clear previous animation dropdown options
          const dropdown = document.getElementById('animationOptionsDropdown');
          if (dropdown) dropdown.innerHTML = '';

          // Populate animation dropdown
          gltf.animations.forEach((clip) => {
              const name = clip.name || 'clip' + Object.keys(actions).length;
              actions[name] = mixer.clipAction(clip);

              const option = document.createElement('div');
              option.className = 'option';
              option.textContent = name;
              option.addEventListener('click', () => selectAnimation(name));
              dropdown.appendChild(option);
          });

          // Reset animation controls UI
          activeAction = null;
          const trigger = document.getElementById('animationSelectTrigger');
          if (trigger) {
              trigger.textContent = gltf.animations.length > 0 ? 'Select' : 'No Animation';
          }

          const timeline = document.getElementById('animationTimeline');
          if (timeline) {
              timeline.max = 1;
              timeline.value = 0;
              timeline.disabled = true;
          }

          // Clear any previous selection highlight in dropdown
          document.querySelectorAll('#animationOptionsDropdown .option').forEach(opt => {
              opt.classList.remove('selected');
          });

          // Setup annotations (views, hotspots, etc.)
          setupAnnotations(currentModel);

          // Fit camera to the new model
          const box = new THREE.Box3().setFromObject(currentModel);
          const center = box.getCenter(new THREE.Vector3());
          const size = box.getSize(new THREE.Vector3());
          const maxDim = Math.max(size.x, size.y, size.z);

          camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
          controls.target.copy(center);
          controls.update();
      },
      undefined,
      function (error) {
          console.error('Failed to load GLTF model:', error);
      });
  }
  function selectAnimation(name) {
      // Stop and reset current action
      if (activeAction) {
          activeAction.stop();
          activeAction.reset();
          activeAction.paused = true;
      }

      if (actions[name]) {
          activeAction = actions[name];

          // Update timeline
          const timeline = document.getElementById('animationTimeline');
          const duration = activeAction.getClip().duration;
          timeline.max = duration;
          timeline.step = duration / 100 || 0.01;
          timeline.value = 0;
          timeline.disabled = false;

          // VISUAL HIGHLIGHT: Add 'selected' class to clicked option
          document.querySelectorAll('#animationOptionsDropdown .option').forEach(opt => {
              if (opt.textContent === name) {
                  opt.classList.add('selected');
              } else {
                  opt.classList.remove('selected');
              }
          });

          // UPDATE TRIGGER TEXT
          const trigger = document.getElementById('animationSelectTrigger');
          if (trigger) {
              trigger.textContent = name;
          }

          // Close dropdown
          const dropdown = document.getElementById('animationOptionsDropdown');
          if (dropdown) {
              dropdown.style.display = 'none';
          }

          // Play the animation (as you want on selection)
          activeAction.reset();
          activeAction.paused = false;
          activeAction.play();
      }
  }
  function playAnimation() {
      if (activeAction) {
          activeAction.paused = false;
          if (activeAction.timeScale < 0) activeAction.timeScale = 1;
          activeAction.play();
      }
  }

  function pauseAnimation() {
      if (activeAction) activeAction.paused = true;
  }

  function reverseAnimation() {
      if (activeAction) {
          activeAction.paused = false;
          activeAction.timeScale = -Math.abs(activeAction.timeScale);
          activeAction.play();
      }
  }

  function setupAnnotations(model) {
      annotations = [];
      const annotationList = document.getElementById('annotationList');
      const existingItems = annotationList.querySelectorAll('button');
      existingItems.forEach(item => item.remove());

      model.traverse(node => {
          if (node.isMesh) {
              let parentHierarchy = [];
              let current = node;
              while (current) {
                  parentHierarchy.push(current.name || '[Unnamed]');
                  current = current.parent;
              }
              if (node.name.toLowerCase().includes('hs_txt') || node.name.toLowerCase().includes('hs_img') || node.name.toLowerCase().includes('hs_vid')) {
                  return;
              }
              if (node.isMesh && node.name.startsWith("Views_")) {
                  const displayName = node.name.substring(6);
                  const worldPos = new THREE.Vector3();
                  node.getWorldPosition(worldPos);

                  const annotation = {
                      name: displayName,
                      target: worldPos.clone(),
                      node: node
                  };

                  annotations.push(annotation);

                  const annotationButton = document.createElement('button');
                  annotationButton.className = 'annotation-btn'; // For CSS styling
                  annotationButton.textContent = displayName;
                  annotationButton.onclick = () => moveCameraToAnnotation(annotation);

                                  annotationList.appendChild(annotationButton);
              }
          }
      });
  }

  function moveCameraToAnnotation(annotation) {
      const startPos = camera.position.clone();
      const target = annotation.target;
      const startTarget = controls.target.clone();
      const closeDistance = 0.3;
      const duration = 1000;
      const startTime = performance.now();

      const hotspotMatrix = new THREE.Matrix4();
      hotspotMatrix.copy(annotation.node.matrixWorld);
      const frontDirection = new THREE.Vector3(0, 1, 0);
      frontDirection.applyMatrix4(hotspotMatrix).sub(target).normalize();

      const endPos = target.clone().add(frontDirection.multiplyScalar(closeDistance));

      function animateCamera(time) {
          const elapsed = time - startTime;
          const t = Math.min(elapsed / duration, 1);

          camera.position.lerpVectors(startPos, endPos, t);
          controls.target.lerpVectors(startTarget, target, t);
          controls.update();

          if (t < 1) {
              requestAnimationFrame(animateCamera);
          }
      }

      requestAnimationFrame(animateCamera);
  }

  function getIntersects(x, y) {
      mouse.x = (x / window.innerWidth) * 2 - 1;
      mouse.y = -(y / window.innerHeight) * 2 + 1;
      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);
      return intersects.filter(intersection => intersection.object.visible);
  }

  function handleHotspot(x, y) {
      const intersects = getIntersects(x, y);

      if (intersects.length > 0) {
          let targetObject = null;
          for (let i = 0; i < intersects.length; i++) {
              let obj = intersects[i].object;
              if (obj.name.toLowerCase().includes("hs_txt") ||
                  obj.name.toLowerCase().includes("hs_img") ||
                  obj.name.toLowerCase().includes("hs_vid")) {
                  targetObject = obj;
                  break;
              }
          }

          if (targetObject) {
              const videoOverlay = document.getElementById('videoOverlay');
              const videoContainer = document.getElementById('videoContainer');
              const textOverlay = document.getElementById('textOverlay');
              let imageOverlay = document.getElementById('imageOverlay');

              if (targetObject.name.toLowerCase().includes("hs_txt")) {
                  targetObject.userData.hotspot = true;
                  targetObject.userData.textContent = "Welcome to Schist Processor demo.<br><br>" +
                      "<a href='https://www.schematicind.com/' target='_blank' style='color: turquoise; text-decoration: underline;'>Visit Website</a>";
                  const textContent = document.getElementById('textContent');
                  if (textContent) {
                      textContent.innerHTML = targetObject.userData.textContent;
                      textOverlay.style.display = 'block';
                  } else {
                      console.error('textContent element not found');
                  }
              } else if (targetObject.name.toLowerCase().includes("hs_img")) {
                  targetObject.userData.hotspot = true;
                  targetObject.userData.imageSrc = "assets/1.png";
                  if (imageOverlay) {
                      imageOverlay.innerHTML = ''; // Clear existing content
                      const imageElement = document.createElement('img');
                      imageElement.src = targetObject.userData.imageSrc;
                      imageElement.onerror = () => console.error("Failed to load image:", targetObject.userData.imageSrc);
                      imageElement.onload = () => console.log("Image loaded successfully");
                      const closeButton = document.createElement('span');
                      closeButton.innerText = 'X';
                      closeButton.className = 'close-icon';
                      closeButton.onclick = () => {
                          imageOverlay.innerHTML = ''; // Clear content but keep overlay visible
                          imageOverlay.appendChild(closeButton);
                          imageOverlay.style.display = 'block';
                      };
                      imageOverlay.appendChild(imageElement);
                      imageOverlay.appendChild(closeButton);
                      imageOverlay.style.display = 'block';
                  }
                  if (videoOverlay) videoOverlay.style.display = 'block'; // Ensure video overlay remains visible
              } else if (targetObject.name.toLowerCase().includes("hs_vid")) {
                  targetObject.userData.hotspot = true;
                  const isLocalVideo = targetObject.name.toLowerCase().startsWith("hs_vid_local_");

                  if (isLocalVideo) {
                      if (targetObject.name === "hs_vid_local_1") {
                          targetObject.userData.videoURL = "videos/VFDisassembly.mp4";
                      } else if (targetObject.name === "hs_vid_local_2") {
                          targetObject.userData.videoURL = "videos/VFFilterWorking.mp4";
                      } else if (targetObject.name === "hs_vid_local_3") {
                          targetObject.userData.videoURL = "videos/VFIntroduction.mp4";
                      } else {
                          targetObject.userData.videoURL = "videos/fallback.mp4";
                      }
                      videoContainer.innerHTML = `
                          <video width="245" height="138" controls>
                              <source src="${targetObject.userData.videoURL}" type="${targetObject.userData.videoURL.endsWith('.webm') ? 'video/webm' : 'video/mp4'}">
                              Your browser does not support the video tag.
                          </video>
                      `;
                  } else {
                      if (targetObject.name === "hs_vid_1") {
                          targetObject.userData.videoURL = "https://www.youtube.com/embed/svhHjElTOz4?si=cVyCj-mqvm6icWpZ";
                      } else if (targetObject.name === "hs_vid_2") {
                          targetObject.userData.videoURL = "https://www.youtube.com/embed/rvPq6wycqAw?si=LIjE9AvDE9zmRUcu";
                      } else if (targetObject.name === "hs_vid_3") {
                          targetObject.userData.videoURL = "https://www.youtube.com/embed/p6vWuOMPIcs?si=01gWUEW0Qsotzm2F";
                      } else {
                          targetObject.userData.videoURL = "https://player.vimeo.com/video/76979871";
                      }
                      videoContainer.innerHTML = `<iframe width="245" height="138"
                          src="${targetObject.userData.videoURL}&autoplay=1"
                          frameborder="0" allowfullscreen></iframe>`;
                  }
                  videoOverlay.style.display = 'block';
                  if (imageOverlay) imageOverlay.style.display = 'block'; // Ensure image overlay remains visible
              }
              return true;
          }
      }

      if (selectedObject) {
          selectedObject.material.emissive.set(0x000000);
          selectedObject = null;
          if (outlineMesh) {
              scene.remove(outlineMesh);
              outlineMesh = null;
          }
      }
      return false;
  }

  function handleHighlight(x, y) {
      const intersects = getIntersects(x, y);
      if (intersects.length > 0) {
          let targetObject = intersects[0].object;
          let isHotspot = false;

          // Check if any intersected object is a hotspot
          for (let i = 0; i < intersects.length; i++) {
              let obj = intersects[i].object;
              if (obj.name.toLowerCase().includes("hs_txt") ||
                  obj.name.toLowerCase().includes("hs_img") ||
                  obj.name.toLowerCase().includes("hs_vid")) {
                  isHotspot = true;
                  break;
              }
          }

          // NEW: Skip selection if mesh name starts with "ns_"
          if (targetObject.name.startsWith('ns_')) {
              return; // Do nothing — non-selectable
          }

          if (!isHotspot) {
              // Clear previous outline
              if (outlineMesh) {
                  scene.remove(outlineMesh);
                  outlineMesh = null;
              }
              if (selectedObject) {
                  selectedObject.material.emissive.set(0x000000);
              }

              selectedObject = targetObject;

              if (selectedObject.isMesh) {
                  selectedObject.updateMatrixWorld();
                  const geometry = selectedObject.geometry.clone();
                  const material = new THREE.MeshBasicMaterial({
                      color: 0x009edd,
                      transparent: true,
                      opacity: 0.5,
                      depthTest: false,
                      depthWrite: false
                  });
                  outlineMesh = new THREE.Mesh(geometry, material);
                  outlineMesh.matrix.copy(selectedObject.matrixWorld);
                  outlineMesh.matrixAutoUpdate = false;
                  outlineMesh.scale.multiplyScalar(1.02);
                  scene.add(outlineMesh);

                  // Optional: Update toggle button text on new selection
                  const toggleBtn = document.getElementById('toggleVisibilityButton');
                  if (toggleBtn) {
                      toggleBtn.textContent = selectedObject.visible ? 'Hide' : 'Show';
                  }
              }
          }
      }
  }

  function setOrthographicView(position, up) {
      if (!currentModel) return;
      if (isFlyMode) {
          isFlyMode = false;
          flyControls.enabled = false;
          orbitControls.enabled = true;
          document.getElementById('flyModeButton').textContent = 'Fly';
          document.getElementById('flyModeButton').classList.remove('active');
          controls = orbitControls;
      }
      camera = orthographicCamera;
      controls.object = camera;

      const box = new THREE.Box3().setFromObject(currentModel);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      const distance = maxDim * 2;

      const aspect = window.innerWidth / window.innerHeight;
      const frustumHeight = maxDim * 2;
      const frustumWidth = frustumHeight * aspect;
      camera.left = -frustumWidth / 2;
      camera.right = frustumWidth / 2;
      camera.top = frustumHeight / 2;
      camera.bottom = -frustumHeight / 2;
      camera.near = 0.1;
      camera.far = distance + maxDim;

      camera.position.set(
          center.x + position.x * distance,
          center.y + position.y * distance,
          center.z + position.z * distance
      );
      camera.up.set(up.x, up.y, up.z);
      camera.lookAt(center);
      controls.target = center;
      controls.enableRotate = false;
      controls.update();
      camera.updateProjectionMatrix();
  }

  function resetPerspectiveView() {
      if (!currentModel) return;
      camera = perspectiveCamera;
      controls.object = camera;

      const box = new THREE.Box3().setFromObject(currentModel);
      const center = box.getCenter(new THREE.Vector3());
      const size = box.getSize(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z);
      camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
      camera.lookAt(center);
      controls.target = center;
      controls.enableRotate = true;
      controls.update();
      flyControls.update(0);
  }

  function animate() {
      requestAnimationFrame(animate);
      const delta = clock.getDelta();

      if (mixer && activeAction) {
          mixer.update(delta);
          if (!activeAction.paused) {
              const timeline = document.getElementById('animationTimeline');
              timeline.value = activeAction.time;
              if (activeAction.time >= activeAction.getClip().duration && activeAction.timeScale > 0) {
                  activeAction.paused = true;
              } else if (activeAction.time <= 0 && activeAction.timeScale < 0) {
                  activeAction.paused = true;
              }
          }
      }
      updateHaloEffects(delta);
      if (flyControls.enabled) {
          flyControls.update(delta);
          clampCameraPitch();
      } else {
          orbitControls.update();
      }
      renderer.render(scene, camera);
  }
