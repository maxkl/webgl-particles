precision mediump float;

uniform sampler2D physicsData;

varying vec2 coord;

void main() {
	gl_FragColor = texture2D(physicsData, coord);
}
