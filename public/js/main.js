(function () {
	'use strict';

	var canvas = document.querySelector('canvas');
	var gl = canvas.getContext('webgl');

	var lastTimestamp;
	var animFrame;

	var width, height;

	var assetLoader = new AssetLoader();

	var PARTICLE_COUNT = 1024 * 1024;
	var PARTICLE_COUNT_SQRT = Math.sqrt(PARTICLE_COUNT);
	var PARTICLE_DATA_SLOTS = 2;
	var PARTICLE_DATA_WIDTH = PARTICLE_COUNT_SQRT * PARTICLE_DATA_SLOTS;
	var PARTICLE_DATA_HEIGHT = PARTICLE_COUNT_SQRT;

	var emitIndex = 0;

	var physicsProgram, copyProgram, renderProgram;
	var viewportBuffer, dataLocationBuffer;
	var framebuffer;
	var physicsInputTexture, physicsOutputTexture;

	var requestedDump = false;

	function updateParticles() {
		// Update particles
		gl.useProgram(physicsProgram.glProgram);

		gl.viewport(0, 0, PARTICLE_DATA_WIDTH, PARTICLE_DATA_HEIGHT);

		gl.bindBuffer(gl.ARRAY_BUFFER, viewportBuffer);
		gl.vertexAttribPointer(physicsProgram.attribs.vertexPosition, 2, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(physicsProgram.attribs.vertexPosition);

		gl.uniform2f(physicsProgram.uniforms.bounds, PARTICLE_DATA_WIDTH, PARTICLE_DATA_HEIGHT);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, physicsInputTexture);
		gl.uniform1i(physicsProgram.uniforms.physicsData, 0);

		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, physicsOutputTexture, 0);

		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);

		// Copy particle data from physicsOutputTexture to physicsInputTexture
		gl.useProgram(copyProgram.glProgram);

		gl.viewport(0, 0, PARTICLE_DATA_WIDTH, PARTICLE_DATA_HEIGHT);

		gl.bindBuffer(gl.ARRAY_BUFFER, viewportBuffer);
		gl.vertexAttribPointer(copyProgram.attribs.vertexPosition, 2, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(copyProgram.attribs.vertexPosition);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, physicsOutputTexture);
		gl.uniform1i(copyProgram.uniforms.physicsData, 0);

		gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
		gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, physicsInputTexture, 0);

		gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

		if(requestedDump) {
			requestedDump = false;

			if(gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE) {
				var pixels = new Float32Array(4 * PARTICLE_DATA_WIDTH * PARTICLE_DATA_HEIGHT);
				gl.readPixels(0, 0, PARTICLE_DATA_WIDTH, PARTICLE_DATA_HEIGHT, gl.RGBA, gl.FLOAT, pixels);
				console.log(pixels);
			} else {
				console.error('Reading from framebuffer not supported');
			}
		}

		gl.bindFramebuffer(gl.FRAMEBUFFER, null);
	}

	function draw(timestamp) {
		animFrame = requestAnimationFrame(draw);

		var deltaTime = lastTimestamp ? (timestamp - lastTimestamp) * 0.001 : 0;
		lastTimestamp = timestamp;

		updateParticles();

		gl.useProgram(renderProgram.glProgram);

		gl.clear(gl.COLOR_BUFFER_BIT);
		gl.viewport(0, 0, width, height);

		gl.bindBuffer(gl.ARRAY_BUFFER, dataLocationBuffer);
		gl.vertexAttribPointer(renderProgram.attribs.dataLocation, 2, gl.FLOAT, false, 0, 0);
		gl.enableVertexAttribArray(renderProgram.attribs.dataLocation);

		gl.activeTexture(gl.TEXTURE0);
		gl.bindTexture(gl.TEXTURE_2D, physicsOutputTexture);
		gl.uniform1i(renderProgram.uniforms.physicsData, 0);

		gl.drawArrays(gl.POINTS, 0, PARTICLE_COUNT);
	}

	function resize() {
		var size = 400;
		width = size;
		height = size;
		canvas.width = width;
		canvas.height = height;
	}

	function play() {
		if(!animFrame) {
			lastTimestamp = 0;
			animFrame = requestAnimationFrame(draw);
		}
	}

	function pause() {
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

	function compileShader(type, source) {
		var shader = gl.createShader(type);
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

	function compileProgram(vertexShaderSource, fragmentShaderSource) {
		var program = gl.createProgram();
		var vertexShader = compileShader(gl.VERTEX_SHADER, vertexShaderSource);
		var fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentShaderSource);
		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
		gl.linkProgram(program);
		if(!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			throw new Error(gl.getProgramInfoLog(program));
		}
		return program;
	}

	function Program(vertexShaderSource, fragmentShaderSource) {
		this.glProgram = compileProgram(vertexShaderSource, fragmentShaderSource);
		this.uniforms = getUniforms(this.glProgram);
		this.attribs = getAttributes(this.glProgram);
	}

	function createPhysicsDataTexture() {
		var size = 4 * PARTICLE_COUNT * PARTICLE_DATA_SLOTS;
		var data = new Float32Array(size);
		return createDataTexture(PARTICLE_DATA_WIDTH, PARTICLE_DATA_HEIGHT, data);
	}

	function createRandomPhysicsDataTexture() {
		var size = 4 * PARTICLE_COUNT * PARTICLE_DATA_SLOTS;
		var data = new Float32Array(size);
		for(var y = 0; y < PARTICLE_DATA_HEIGHT; y++) {
			for(var x = 0; x < PARTICLE_DATA_WIDTH; x += PARTICLE_DATA_SLOTS) {
				var index = y * PARTICLE_DATA_WIDTH + x;
				data[index + 0] = Math.random() * 2 - 1;
				data[index + 1] = Math.random() * 2 - 1;
				data[index + 2] = Math.random() * 2 - 1;

				data[index + 4] = 0;//Math.random() * 2 - 1;
				data[index + 5] = 0;//Math.random() * 2 - 1;
				data[index + 6] = 0;//Math.random() * 2 - 1;
			}
		}
		return createDataTexture(PARTICLE_DATA_WIDTH, PARTICLE_DATA_HEIGHT, data);
	}

	function createViewportBuffer() {
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
		var data = new Float32Array(PARTICLE_COUNT * 2);
		var step = 1 / PARTICLE_COUNT_SQRT;
		for(var i = 0; i < PARTICLE_COUNT; i++) {
			var uIndex = i * 2;
			var vIndex = uIndex + 1;
			data[uIndex] = step * Math.floor(i % PARTICLE_COUNT_SQRT);
			data[vIndex] = step * Math.floor(i / PARTICLE_COUNT_SQRT);
		}
		var buffer = gl.createBuffer();
		gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
		gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
		return buffer;
	}

	function addParticles(count, x, y, z, vx, vy, vz) {
		gl.bindTexture(gl.TEXTURE_2D, physicsInputTexture);
		var startIndexX = Math.floor((emitIndex * PARTICLE_DATA_SLOTS) % PARTICLE_DATA_WIDTH);
		var startIndexY = Math.floor(emitIndex / PARTICLE_DATA_HEIGHT);
		var indexX = startIndexX;
		var indexY = startIndexY;
		var data = [];
		for(var i = 0; i < count; i++) {
			data.push(
				x + Math.random() * 0.04 - 0.02,
				y + Math.random() * 0.04 - 0.02,
				z + Math.random() * 0.02 - 0.01,
				Math.random() * 10,
				vx + Math.random() * 2 - 1,
				vy + Math.random() * 2 - 1,
				vz + Math.random() * 2 - 1,
				0
			);

			indexX += PARTICLE_DATA_SLOTS;
			if(indexX >= PARTICLE_DATA_WIDTH) {
				gl.texSubImage2D(
					gl.TEXTURE_2D, 0,
					startIndexX, startIndexY, indexX - startIndexX, 1,
					gl.RGBA, gl.FLOAT, new Float32Array(data)
				);
				data.length = 0;
				indexX = 0;
				indexY++;
				if(indexY >= PARTICLE_DATA_HEIGHT) {
					indexY = 0;
				}
				startIndexX = indexX;
				startIndexY = indexY;
			}
		}
		if(indexX > startIndexX) {
			gl.texSubImage2D(
				gl.TEXTURE_2D, 0,
				startIndexX, startIndexY, indexX - startIndexX, 1,
				gl.RGBA, gl.FLOAT, new Float32Array(data)
			);
		}
		emitIndex += count;
		emitIndex %= PARTICLE_COUNT;
	};

	function init() {
		resize();
		window.addEventListener('resize', resize);

		physicsProgram = new Program(
			assetLoader.assets['physics.vert'],
			assetLoader.assets['physics.frag']
		);

		copyProgram = new Program(
			assetLoader.assets['copy.vert'],
			assetLoader.assets['copy.frag']
		);

		renderProgram = new Program(
			assetLoader.assets['render.vert'],
			assetLoader.assets['render.frag']
		);

		viewportBuffer = createViewportBuffer();
		dataLocationBuffer = createDataLocationBuffer();
		framebuffer = gl.createFramebuffer();
		physicsInputTexture = createRandomPhysicsDataTexture();
		physicsOutputTexture = createPhysicsDataTexture();

		gl.clearColor(0, 0, 0, 1);

		/*addParticles(
			1000,
			10,//Math.random() * 2 - 1,
			Math.random() * 2 - 1,
			0,
			0,
			0,
			0
		);*/
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

	window.dump = function () {
		requestedDump = true;
	};
})();