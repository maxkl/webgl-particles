precision mediump float;

uniform sampler2D physicsData;

attribute vec2 dataLocation;

void main() {
	vec4 particle = texture2D(physicsData, dataLocation);
	float perspective = 1.0 + particle.z * 5.5;
	gl_Position = vec4(particle.xyz, perspective);
	gl_PointSize = 1.0;
}
