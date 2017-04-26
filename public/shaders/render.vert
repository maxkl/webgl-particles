precision mediump float;

uniform sampler2D physicsData;

attribute vec2 dataLocation;

void main() {
	vec4 particle = texture2D(physicsData, dataLocation);
	gl_Position = vec4(particle.xy, 0, 1);
	gl_PointSize = 1.0;
}
