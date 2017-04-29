(function () {
	'use strict';

	var $restrictInput = document.querySelector('#restrict');
	var $particleCountInput = document.querySelector('#particle-count');
	var $applyBtn = document.querySelector('#apply');
	var canvas = document.querySelector('canvas');
	var gl = canvas.getContext('webgl');

	var lastTimestamp;
	var animFrame;

	var initialized = false;

	var keys = {};
	var playing = false;

	var width, height;

	var assetLoader = new AssetLoader();

	var particleCount, particleCountSqrt;

	var physicsProgram, copyProgram, renderProgram;
	var viewportBuffer, dataLocationBuffer;
	var framebuffer;
	var physicsInputTexture, physicsOutputTexture;

	var targetX, targetY;

	function updateParticles() {
		gl.viewport(0, 0, particleCountSqrt, particleCountSqrt);

		// Update particles
		gl.useProgram(physicsProgram.glProgram);

		gl.bindBuffer(gl.ARRAY_BUFFER, viewportBuffer);
		gl.vertexAttribPointer(physicsProgram.attribs.vertexPosition, 2, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(physicsProgram.attribs.vertexPosition);

		gl.uniform2f(physicsProgram.uniforms.bounds, particleCountSqrt, particleCountSqrt);

		gl.uniform2f(physicsProgram.uniforms.target, targetX, targetY);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, physicsInputTexture);
		gl.uniform1i(physicsProgram.uniforms.physicsData, 0);

		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, physicsOutputTexture, 0);

		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);

		// Copy particle data from physicsOutputTexture to physicsInputTexture
		gl.useProgram(copyProgram.glProgram);

		gl.bindBuffer(gl.ARRAY_BUFFER, viewportBuffer);
		gl.vertexAttribPointer(copyProgram.attribs.vertexPosition, 2, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(copyProgram.attribs.vertexPosition);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, physicsOutputTexture);
		gl.uniform1i(copyProgram.uniforms.physicsData, 0);

		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, physicsInputTexture, 0);

		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}

	function draw(timestamp) {
		animFrame = requestAnimationFrame(draw);

		updateParticles();

		gl.viewport(0, 0, width, height);
		gl.clear(gl.COLOR_BUFFER_BIT);
		
		gl.useProgram(renderProgram.glProgram);

		gl.bindBuffer(gl.ARRAY_BUFFER, dataLocationBuffer);
		gl.vertexAttribPointer(renderProgram.attribs.dataLocation, 2, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(renderProgram.attribs.dataLocation);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, physicsOutputTexture);
		gl.uniform1i(renderProgram.uniforms.physicsData, 0);

		gl.drawArrays(gl.POINTS, 0, particleCount);
	}

	function resize() {
		width = window.innerWidth;
		height = window.innerHeight;
		canvas.width = width;
		canvas.height = height;
	}

	function play() {
		if(!playing) {
			playing = true;
			lastTimestamp = 0;
			animFrame = requestAnimationFrame(draw);
		}
	}

	function pause() {
		playing = false;
		cancelAnimationFrame(animFrame);
		animFrame = null;
	}

	function createDataTexture(width, height, data) {
		var tex = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, tex);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.FLOAT, data);
		return tex;
	}

	function compileShader(type, source, macros) {
		var shader = gl.createShader(type);
		var macrosSource = '';
		if(macros) {
			for(var i = 0; i < macros.length; i++) {
				macrosSource += '#define ' + macros[i] + '\n';
			}
		}
		source = macrosSource + source;
		gl.shaderSource(shader, source);
		gl.compileShader(shader);
		if(!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			throw new Error(gl.getShaderInfoLog(shader));
		}
		return shader;
	}

	function getUniforms(program) {
		var uniforms = {};
		var count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
		for(var i = 0; i < count; i++) {
			var uniform = gl.getActiveUniform(program, i);
			uniforms[uniform.name] = gl.getUniformLocation(program, uniform.name);
		}
		return uniforms;
	}

	function getAttributes(program) {
		var attribs = {};
		var count = gl.getProgramParameter(program, gl.ACTIVE_ATTRIBUTES);
		for(var i = 0; i < count; i++) {
			var attrib = gl.getActiveAttrib(program, i);
			attribs[attrib.name] = gl.getAttribLocation(program, attrib.name);
		}
		return attribs;
	}

	function compileProgram(vertexShaderSource, fragmentShaderSource, macros) {
		var program = gl.createProgram();
		var vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource, macros);
		var fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource, macros);
		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
		gl.linkProgram(program);
		if(!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			throw new Error(gl.getProgramInfoLog(program));
		}
		gl.deleteShader(vertexShader);
		gl.deleteShader(fragmentShader);
		return program;
	}

	function Program(vertexShaderSource, fragmentShaderSource, macros) {
		this.glProgram = compileProgram(vertexShaderSource, fragmentShaderSource, macros);
		this.uniforms = getUniforms(this.glProgram);
		this.attribs = getAttributes(this.glProgram);
	}

	function createPhysicsDataTexture() {
		var size = 4 * particleCount;
		var data = new Float32Array(size);
		return createDataTexture(particleCountSqrt, particleCountSqrt, data);
	}

	function createRandomPhysicsDataTexture() {
		var size = 4 * particleCount;
		var data = new Float32Array(size);
		for(var y = 0; y < particleCountSqrt; y++) {
			for(var x = 0; x < particleCountSqrt; x++) {
				var index = y * particleCountSqrt + x;
				data[index + 0] = Math.random() * 2 - 1;
				data[index + 1] = Math.random() * 2 - 1;
				data[index + 2] = Math.random() * 2 - 1;
				data[index + 3] = Math.random() * 2 - 1;
			}
		}
		return createDataTexture(particleCountSqrt, particleCountSqrt, data);
	}

	function createViewportBuffer() {
		// Clip-space coordinates
		var data = new Float32Array([
			-1, -1,
			1, -1,
			-1, 1,
			1, 1
		]);
		var buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
		return buffer;
	}

	function createDataLocationBuffer() {
		var data = new Float32Array(particleCount * 2);
		var step = 1 / particleCountSqrt;
		for(var i = 0; i < particleCount; i++) {
			var uIndex = i * 2;
			var vIndex = uIndex + 1;
			data[uIndex] = step * Math.floor(i % particleCountSqrt);
			data[vIndex] = step * Math.floor(i / particleCountSqrt);
		}
		var buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
		return buffer;
	}

	function deinit() {
		gl.deleteProgram(physicsProgram.glProgram);
		gl.deleteProgram(copyProgram.glProgram);
		gl.deleteProgram(renderProgram.glProgram);

		gl.deleteBuffer(viewportBuffer);
		gl.deleteBuffer(dataLocationBuffer);

		gl.deleteFramebuffer(framebuffer);

		gl.deleteTexture(physicsInputTexture);
		gl.deleteTexture(physicsOutputTexture);
	}

	function addEventListeners() {
		window.addEventListener('resize', resize);

		window.addEventListener('keydown', function (evt) {
			var keyCode = evt.which;
			if(!keys[keyCode]) {
				keys[keyCode] = true;

				switch(keyCode) {
					case 80: // P
						if(playing) {
							pause();
						} else {
							play();
						}
						break;
				}
			}
		});

		window.addEventListener('keyup', function (evt) {
			var keyCode = evt.which;
			if(keys[keyCode]) {
				keys[keyCode] = false;
			}
		});

		canvas.addEventListener('mousemove', function (evt) {
			evt.preventDefault();

			if(playing) {
				var rect = canvas.getBoundingClientRect();
				var x = evt.clientX - rect.left;
				var y = evt.clientY - rect.top;
				if(x >= 0 && x <= rect.width && y >= 0 && y <= rect.height) {
					targetX = (x / rect.width) * 2 - 1;
					targetY = -(y / rect.height) * 2 + 1;
				}
			}
		});

		$applyBtn.addEventListener('click', function () {
			init();
		});
	}

	function init() {
		if(initialized) {
			deinit();
		}

		particleCount = +$particleCountInput.value;
		particleCountSqrt = Math.sqrt(particleCount);

		var macros = [];
		if($restrictInput.checked) {
			macros.push('RESTRICT_POSITION');
		}

		resize();

		targetX = 0;
		targetY = 0;

		physicsProgram = new Program(
			assetLoader.assets['physics.vert'],
			assetLoader.assets['physics.frag'],
			macros
		);

		copyProgram = new Program(
			assetLoader.assets['copy.vert'],
			assetLoader.assets['copy.frag'],
			macros
		);

		renderProgram = new Program(
			assetLoader.assets['render.vert'],
			assetLoader.assets['render.frag'],
			macros
		);

		viewportBuffer = createViewportBuffer();
		dataLocationBuffer = createDataLocationBuffer();
		framebuffer = gl.createFramebuffer();
		physicsInputTexture = createRandomPhysicsDataTexture();
		physicsOutputTexture = createPhysicsDataTexture();

		gl.clearColor(0, 0, 0, 1);

		if(!initialized) {
			addEventListeners();
		}

		initialized = true;
	}

	if(!gl) {
		console.error('WebGL not supported');
		return;
	}

	if(!gl.getExtension('OES_texture_float')) {
		console.error('Floating point textures not supported');
		return;
	}

	assetLoader.loadAll([
		[ 'txt', 'shaders/physics.vert', 'physics.vert' ],
		[ 'txt', 'shaders/physics.frag', 'physics.frag' ],
		[ 'txt', 'shaders/copy.vert', 'copy.vert' ],
		[ 'txt', 'shaders/copy.frag', 'copy.frag' ],
		[ 'txt', 'shaders/render.vert', 'render.vert' ],
		[ 'txt', 'shaders/render.frag', 'render.frag' ]
	]).then(function () {
		init();
		play();
	}).catch(function (err) {
		console.error(err);
	});
})();