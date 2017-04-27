precision mediump float;

attribute vec2 vertexPosition;

varying vec2 coord;

void main() {
	coord = vertexPosition * 0.5 + 0.5;
	gl_Position = vec4(vertexPosition, 0.0, 1.0);
}
