precision mediump float;

uniform sampler2D physicsData;

attribute vec2 dataLocation;

varying vec2 velocity;

void main() {
	vec4 data = texture2D(physicsData, dataLocation);
	velocity = data.zw;
	gl_Position = vec4(data.xy, 0.0, 1.0);
	gl_PointSize = 1.0;
}
