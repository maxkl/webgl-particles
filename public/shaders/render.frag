precision mediump float;

varying vec2 velocity;

void main() {
	float v = length(velocity) / 10.0;
	gl_FragColor = vec4(v, v, 1.0, 1.0);
}
