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
    Object.defineProperty(window, 'selectedObject', { get: () => selectedObject });
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
    let hideableParts = []; // Stores all parts with "hide_" prefix
    const pitchLimit = 54 * (Math.PI / 180);
    let is360Rotating = false;
    let rotation360Angle = 0;
    let rotation360Paused = false;

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
//    addListener('loadModelBtn', 'click', () => {
//        document.getElementById('fileInput').click();
//    });

    addListener('loadHdriBtn', 'click', () => {
        document.getElementById('hdriInput').click();
    });
    addListener('showAllButton', 'click', () => {
        if (currentModel) {
            currentModel.traverse(node => {
                if (node.isMesh) {
                    const isHidePart = node.name.toLowerCase().startsWith('hide_');
                    const isDimension = node.name.startsWith('Dimension_');
                    // Only restore visibility for meshes that were manually hidden by the user
                    // Leave hide_ parts and dimension meshes in their managed state
                    if (!isHidePart && !isDimension) {
                        node.visible = true;
                        if (originalMaterials.has(node)) {
                            node.material = originalMaterials.get(node);
                            node.material.needsUpdate = true;
                            originalMaterials.delete(node);
                        }
                    }
                }
            });
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

    /* VIEW LISTENERS COMMENTED OUT — uncomment to restore
    addListener('frontView', 'click', () => setOrthographicView({ x: 1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }));
    addListener('backView', 'click', () => setOrthographicView({ x: -1, y: 0, z: 0 }, { x: 0, y: 1, z: 0 }));
    addListener('leftView', 'click', () => setOrthographicView({ x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }));
    addListener('rightView', 'click', () => setOrthographicView({ x: 0, y: 0, z: 1 }, { x: 0, y: 1, z: 0 }));
    addListener('topView', 'click', () => setOrthographicView({ x: 0, y: 1, z: 0 }, { x: 0, y: 0, z: 1 }));
    addListener('bottomView', 'click', () => setOrthographicView({ x: 0, y: -1, z: 0 }, { x: 0, y: 0, z: 1 }));
    addListener('resetView', 'click', resetPerspectiveView);
    */

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
    loadGLTFModel();
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

function loadGLTFModel() {
    const loader = new GLTFLoader();
    const modelPath = './Model/Schist.glb';   // ← Base model only
    const hdriPath = './HDRI/photo_studio_01_4k.hdr';

    console.log('Loading Base Model from:', modelPath);

    const overlay = document.getElementById('modelLoadingOverlay');
    const progressFill = document.getElementById('modelProgressFill');
    const progressPercent = document.getElementById('modelProgressPercent');
    if (overlay) overlay.classList.add('visible');

    loader.load(modelPath, function (gltf) {
        console.log('Base Model loaded successfully!');
        if (overlay) overlay.classList.remove('visible');

        if (currentModel) scene.remove(currentModel);

        currentModel = gltf.scene;
        scene.add(currentModel);

        // Save original materials
        originalMaterials.clear();
        currentModel.traverse((node) => {
            if (node.isMesh && node.material) {
                originalMaterials.set(node, node.material.clone());
            }
        });

        // Hide_ parts and halos
        hideableParts = [];
        currentModel.traverse((node) => {
            if (node.isMesh) {
                if (node.name.toLowerCase().startsWith('hide_')) {
                    hideableParts.push(node);
                    node.visible = true;
                }
                if (node.name.toLowerCase().includes('hs_')) {
                    setupHaloEffect(node);
                }
            }
        });

        mixer = new THREE.AnimationMixer(scene);

        // Populate dropdown
        const dropdown = document.getElementById('animationOptionsDropdown');
        if (dropdown) dropdown.innerHTML = '';

        const noAnimOption = document.createElement('div');
        noAnimOption.className = 'option';
        noAnimOption.textContent = 'No Animation';
        noAnimOption.onclick = () => selectAnimation(null);
        dropdown.appendChild(noAnimOption);

        // Add your animation options here (you can hardcode or load from a list)
        const animationsList = ['Bowl Raise', 'Clamp Animation', 'Bowl Rotate', '360°']; // ← Add your track names
        animationsList.forEach(name => {
            const option = document.createElement('div');
            option.className = 'option';
            option.textContent = name;
            option.addEventListener('click', () => selectAnimation(name));
            dropdown.appendChild(option);
        });

        setupAnnotations(currentModel);
        setupViewpoints();

        // Camera fit
        const box = new THREE.Box3().setFromObject(currentModel);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
        controls.target.copy(center);
        controls.update();

    }, function (progress) {
        if (progress.total > 0) {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            if (progressFill) progressFill.style.width = percent + '%';
            if (progressPercent) progressPercent.textContent = percent + '%';
        }
    }, function (error) {
        console.error('GLTF load failed:', error);
        if (overlay) overlay.classList.remove('visible');
    });

    // HDRI — load separately, independent of model
 new RGBELoader().load(hdriPath, function (texture) {
     texture.mapping = THREE.EquirectangularReflectionMapping;
     const pmremGenerator = new THREE.PMREMGenerator(renderer);
     pmremGenerator.compileEquirectangularShader();
     const envMap = pmremGenerator.fromEquirectangular(texture).texture;
     scene.environment = envMap;
     scene.background = new THREE.CanvasTexture(gradientCanvas);
     pmremGenerator.dispose();
     texture.dispose();
 }, undefined, function (error) {
     console.error('HDRI load failed:', error);
 });
}

function selectAnimation(name) {
    // Stop any previous action
    if (activeAction) {
        activeAction.stop();
        activeAction = null;
    }

    // Reset animation state flags
    is360Rotating = false;
    rotation360Paused = false;
    rotation360Angle = 0;

    // Hide any helper animation scene
    if (window._lastAnimScene) {
        window._lastAnimScene.visible = false;
    }

    // Update UI
    const trigger = document.getElementById("animationSelectTrigger");
    if (trigger) trigger.textContent = name || "No Animation";

    const timeline = document.getElementById("animationTimeline");
    if (timeline) {
        timeline.value = 0;
        timeline.disabled = true;
    }

    // ────────────────────────────────
    //  CASE 1: NO ANIMATION SELECTED
    // ────────────────────────────────
    if (!name) {
        console.log("No animation selected: showing base model");

        // Hide Clamp scene if visible
        if (window._clampScene) window._clampScene.visible = false;

        // Show base model again
        if (currentModel) currentModel.visible = true;

        mixer = null;
        activeAction = null;
        // 🔹 Show back all meshes whose names start with "hide_"
        if (currentModel) {
            currentModel.traverse(node => {
                if (node.isMesh && node.name.startsWith("hide_")) {
                    node.visible = true;
                }
            });
        }


        return;
    }

    // ────────────────────────────────
    //  CASE 2: 360° ROTATION
    // ────────────────────────────────
    if (name === "360°") {
        if (timeline) {
            timeline.max = 360;
            timeline.step = 1;
            timeline.value = 0;
            timeline.disabled = false;
        }
        is360Rotating = true;
        rotation360Angle = 0;
        return;
    }

    // Shared loader (register pointer extension only once globally)
    if (!window._sharedLoader) {
        window._sharedLoader = new GLTFLoader();
        window._sharedLoader.register(p => new GLTFAnimationPointerExtension(p));
    }
    const loader = window._sharedLoader;

    // ────────────────────────────────
    //  CASE 3: CLAMP ANIMATION
    // ────────────────────────────────
    if (name === "Clamp Animation") {
        console.log("Playing Clamp Animation...");

        // Hide base model (keep its data)
        if (currentModel) currentModel.visible = false;

        // If already loaded once, reuse instantly
        if (window._clampScene) {
            window._clampScene.visible = true;
            playClampAnimation(window._clampScene, window._clampClip);
            return;
        }

        const clampOverlay = document.getElementById('modelLoadingOverlay');
        const clampProgressFill = document.getElementById('modelProgressFill');
        const clampProgressPercent = document.getElementById('modelProgressPercent');
        const clampLabel = document.getElementById('modelLoadingLabel');
        if (clampOverlay) { clampOverlay.classList.add('visible'); }
        if (clampLabel) clampLabel.textContent = 'Loading Animation...';
        if (clampProgressFill) clampProgressFill.style.width = '0%';
        if (clampProgressPercent) clampProgressPercent.textContent = '0%';

        loader.load(`animations/${name}.glb`, gltf => {
            if (clampOverlay) clampOverlay.classList.remove('visible');
            if (clampLabel) clampLabel.textContent = 'Loading Model...';

            const clampScene = gltf.scene;
            clampScene.visible = true;
            window._clampScene = clampScene;
            window._clampClip = gltf.animations[0];
            scene.add(clampScene);

            playClampAnimation(clampScene, gltf.animations[0]);
        }, function (progress) {
            if (progress.total > 0) {
                const percent = Math.round((progress.loaded / progress.total) * 100);
                if (clampProgressFill) clampProgressFill.style.width = percent + '%';
                if (clampProgressPercent) clampProgressPercent.textContent = percent + '%';
            }
        }, function (error) {
            console.error('Clamp animation load failed:', error);
            if (clampOverlay) clampOverlay.classList.remove('visible');
            if (clampLabel) clampLabel.textContent = 'Loading Model...';
        });

        return;
    }

    // ────────────────────────────────
    //  CASE 4: POINTER-BASED ANIMATIONS
    // ────────────────────────────────
    console.log(`Playing base-model animation: ${name}`);

    // Hide Clamp scene, show base model
    if (window._clampScene) window._clampScene.visible = false;
    if (currentModel) currentModel.visible = true;

    const animOverlay = document.getElementById('modelLoadingOverlay');
    const animProgressFill = document.getElementById('modelProgressFill');
    const animProgressPercent = document.getElementById('modelProgressPercent');
    const animLabel = document.getElementById('modelLoadingLabel');
    if (animOverlay) { animOverlay.classList.add('visible'); }
    if (animLabel) animLabel.textContent = 'Loading Animation...';
    if (animProgressFill) animProgressFill.style.width = '0%';
    if (animProgressPercent) animProgressPercent.textContent = '0%';

    loader.load(`animations/${name}.glb`, gltf => {
        if (animOverlay) animOverlay.classList.remove('visible');
        if (animLabel) animLabel.textContent = 'Loading Model...';

        const clip = gltf.animations[0];
        if (!clip) {
            console.warn("No animation found in", name);
            return;
        }

        // Hide any geometry inside this animation .glb
        gltf.scene.traverse(node => {
            if (node.isMesh) node.visible = false;
        });

        scene.add(gltf.scene);
        window._lastAnimScene = gltf.scene;

        // Mixer on scene for pointer binding
        if (mixer) {
            mixer.stopAllAction();
            mixer.uncacheRoot(scene);
        }
        mixer = new THREE.AnimationMixer(scene);

        activeAction = mixer.clipAction(clip);
        activeAction.setLoop(THREE.LoopOnce, 1);
        activeAction.clampWhenFinished = true;
        activeAction.reset();
        activeAction.timeScale = 1;
        activeAction.play();
        // 🔹 Hide all meshes whose names start with "hide_"
        if (currentModel) {
            currentModel.traverse(node => {
                if (node.isMesh && node.name.startsWith("hide_")) {
                    node.visible = false;
                }
            });
        }

        // Update timeline slider
        if (timeline) {
            timeline.max = clip.duration;
            timeline.step = 0.001;
            timeline.value = 0;
            timeline.disabled = false;
        }
    }, function (progress) {
        if (progress.total > 0) {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            if (animProgressFill) animProgressFill.style.width = percent + '%';
            if (animProgressPercent) animProgressPercent.textContent = percent + '%';
        }
    }, function (error) {
        console.error('Animation load failed:', error);
        if (animOverlay) animOverlay.classList.remove('visible');
        if (animLabel) animLabel.textContent = 'Loading Model...';
    });

    // ────────────────────────────────
    //  INTERNAL HELPER: Clamp Playback
    // ────────────────────────────────
    function playClampAnimation(sceneObj, clip) {
        if (!clip) {
            console.warn("Clamp animation clip missing");
            return;
        }
        if (mixer) {
            mixer.stopAllAction();
            mixer.uncacheRoot(scene);
        }

        mixer = new THREE.AnimationMixer(sceneObj);
        activeAction = mixer.clipAction(clip);
        activeAction.setLoop(THREE.LoopOnce, 1);
        activeAction.clampWhenFinished = true;
        activeAction.reset();
        activeAction.timeScale = 1;
        activeAction.paused = false;
        activeAction.play();
        // Hide "Hide_" prefixed parts while animation runs
        // 🔹 Hide all meshes whose names start with "hide_"
        if (currentModel) {
            currentModel.traverse(node => {
                if (node.isMesh && node.name.startsWith("hide_")) {
                    node.visible = false;
                }
            });
        }



        // Refocus camera
        const box = new THREE.Box3().setFromObject(sceneObj);
        const center = box.getCenter(new THREE.Vector3());
        const size = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(size.x, size.y, size.z);
        camera.position.set(center.x + maxDim, center.y + maxDim, center.z + maxDim);
        controls.target.copy(center);
        controls.update();

        if (timeline) {
            timeline.max = clip.duration;
            timeline.step = 0.001;
            timeline.disabled = false;
        }
    }
}

function playAnimation() {
    if (is360Rotating || rotation360Paused) {
        rotation360Paused = false;
        is360Rotating = true;
        return;
    }
    if (activeAction) {
        activeAction.paused = false;
        if (activeAction.timeScale < 0) activeAction.timeScale = 1;
        activeAction.play();
        // 🔹 Hide all meshes whose names start with "hide_"
        if (currentModel) {
            currentModel.traverse(node => {
                if (node.isMesh && node.name.startsWith("hide_")) {
                    node.visible = false;
                }
            });
        }


    }
}

function pauseAnimation() {
    if (is360Rotating) {
        rotation360Paused = true;
        is360Rotating = false;
        return;
    }
    if (activeAction) activeAction.paused = true;
}

function reverseAnimation() {
    if (is360Rotating || rotation360Paused) {
        // Reverse not meaningful for rotation, just restart
        rotation360Angle = 0;
        rotation360Paused = false;
        is360Rotating = true;
        if (currentModel) currentModel.rotation.y = 0;
        return;
    }
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
                        targetObject.userData.videoURL = "videos/Centrifuging.mp4";
                    } else if (targetObject.name === "hs_vid_local_2") {
                        targetObject.userData.videoURL = "videos/Intro.mp4";
                    } else if (targetObject.name === "hs_vid_local_3") {
                        targetObject.userData.videoURL = "videos/Delumping.mp4";
                    }
                    else if (targetObject.name === "hs_vid_local_4") {
                        targetObject.userData.videoURL = "videos/Packing.mp4";
                    }
                    else if (targetObject.name === "hs_vid_local_5") {
                        targetObject.userData.videoURL = "videos/Milling.mp4";
                    }
                     else {
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
                        targetObject.userData.videoURL = "https://www.youtube.com/embed/p6vWuOMPIcs?si=01gWUEW0Qsotzm2F";
                    } else if (targetObject.name === "hs_vid_2") {
                        targetObject.userData.videoURL = "https://www.youtube.com/embed/svhHjElTOz4?si=cVyCj-mqvm6icWpZ";
                    } else if (targetObject.name === "hs_vid_3") {
                        targetObject.userData.videoURL = "https://www.youtube.com/embed/rvPq6wycqAw?si=LIjE9AvDE9zmRUcu";
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

/* setOrthographicView and resetPerspectiveView COMMENTED OUT — uncomment to restore
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
*/

// ─── Viewpoints ───────────────────────────────────────────────────────────────
// Scans the model for meshes named "viewpoint{N}_{label}" and builds
// a button per group. Clicking a button hides that group and shows all others.
// Naming convention: viewpoint1_Overview, viewpoint2_Internals, etc.
// Multiple meshes can share the same prefix — they all hide/show together.

let viewpointGroups = new Map();
let activeViewpoint = null;

// ─── Viewpoints ───────────────────────────────────────────────────────────────
// Each viewpoint is a separate GLB in the viewpoints/ folder.
// The GLB contains only the meshes that should be VISIBLE for that viewpoint.
// On click: hide base model, load viewpoint GLB, show it.
// On Show All: remove viewpoint GLB, restore base model.

let viewpointModel = null; // currently loaded viewpoint GLB
const viewpointsList = ['Bowl Only', 'Dryer Bowl', 'Centrifuge Bowl', 'Assembly without Bowl']; // ← add your viewpoint names here

function setupViewpoints() {
    const list = document.getElementById('viewpointList');
    if (!list) return;
    list.innerHTML = '';

    const showAllBtn = document.createElement('button');
    showAllBtn.className = 'viewpoint-btn';
    showAllBtn.textContent = 'Show All';
    showAllBtn.classList.add('active');
    showAllBtn.onclick = () => {
        // Remove viewpoint GLB
        if (viewpointModel) {
            scene.remove(viewpointModel);
            viewpointModel = null;
        }
        // Restore base model
        if (currentModel) currentModel.visible = true;

        list.querySelectorAll('.viewpoint-btn').forEach(b => b.classList.remove('active'));
        showAllBtn.classList.add('active');
    };
    list.appendChild(showAllBtn);

    viewpointsList.forEach(name => {
        const btn = document.createElement('button');
        btn.className = 'viewpoint-btn';
        btn.textContent = name;
        btn.onclick = () => selectViewpoint(name, btn, list);
        list.appendChild(btn);
    });

    const panel = document.getElementById('viewpointPanel');
    if (panel) panel.style.display = viewpointsList.length > 0 ? 'flex' : 'none';
}

function selectViewpoint(name, btn, list) {
    // Remove previous viewpoint GLB if any
    if (viewpointModel) {
        scene.remove(viewpointModel);
        viewpointModel = null;
    }

    // Hide base model
    if (currentModel) currentModel.visible = false;

    // Update active button immediately
    list.querySelectorAll('.viewpoint-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');

    // Show loading overlay
    const overlay = document.getElementById('modelLoadingOverlay');
    const progressFill = document.getElementById('modelProgressFill');
    const progressPercent = document.getElementById('modelProgressPercent');
    if (overlay) overlay.classList.add('visible');
    if (progressFill) progressFill.style.width = '0%';
    if (progressPercent) progressPercent.textContent = '0%';

    // Load viewpoint GLB
    const loader = new GLTFLoader();
    loader.load(`viewpoints/${name}.glb`, function (gltf) {
        viewpointModel = gltf.scene;
        scene.add(viewpointModel);

        // Hide overlay on success
        if (overlay) overlay.classList.remove('visible');

    }, function (progress) {
        if (progress.total > 0) {
            const percent = Math.round((progress.loaded / progress.total) * 100);
            if (progressFill) progressFill.style.width = percent + '%';
            if (progressPercent) progressPercent.textContent = percent + '%';
        }
    }, function (error) {
        console.error(`Failed to load viewpoint: ${name}`, error);
        // Restore base model and hide overlay on failure
        if (currentModel) currentModel.visible = true;
        if (overlay) overlay.classList.remove('visible');
    });
}
// ─────────────────────────────────────────────────────────────────────────────

const TARGET_FPS = 1000;
const FRAME_INTERVAL = 1000 / TARGET_FPS;
let lastFrameTime = 0;
let fpsFrameCount = 0;
let fpsLastTime = performance.now();
let lastDrawCallTime = 0;

function animate() {
    requestAnimationFrame(animate);

    // FPS cap — check first before doing any work
    const now = performance.now();
    if (now - lastFrameTime < FRAME_INTERVAL) return;
    lastFrameTime = now;

    const delta = clock.getDelta(); // ← moved here, after the cap

    // FPS counter
    fpsFrameCount++;
    if (now - fpsLastTime >= 500) {
        const fps = Math.round((fpsFrameCount * 1000) / (now - fpsLastTime));
        const fpsEl = document.getElementById('fpsValue');
        if (fpsEl) {
            fpsEl.textContent = `${fps} FPS`;
            fpsEl.style.color = fps >= 50 ? '#4ade80' : fps >= 30 ? '#facc15' : '#f87171';
        }
        fpsFrameCount = 0;
        fpsLastTime = now;
    }
    // 360° rotation
    if (is360Rotating && !rotation360Paused) {
        if (currentModel) {
            currentModel.rotation.y += (Math.PI / 180); // 1° per frame
            rotation360Angle = (rotation360Angle + 1) % 360;
            const timeline = document.getElementById('animationTimeline');
            if (timeline) timeline.value = rotation360Angle;
            if (rotation360Angle === 0) {
                // Completed one full rotation — stop
                is360Rotating = false;
                rotation360Paused = true;
            }
        }
    }
    // Draw calls counter
    if (now - lastDrawCallTime >= 500) {
        const drawCalls = renderer.info.render.calls;
        const triangles = renderer.info.render.triangles;
        const dcEl = document.getElementById('drawCallValue');
        const triEl = document.getElementById('triangleValue');
        if (dcEl) {
            dcEl.textContent = `${drawCalls} DC`;
            dcEl.style.color = drawCalls <= 100 ? '#4ade80' : drawCalls <= 300 ? '#facc15' : '#f87171';
        }
        if (triEl) triEl.textContent = `${(triangles / 1000).toFixed(0)}K TRI`;
        lastDrawCallTime = now;
    }

    // Animation mixer
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
