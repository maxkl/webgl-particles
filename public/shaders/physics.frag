precision mediump float;

uniform sampler2D physicsData;
uniform vec2 bounds;
uniform vec2 target;

void main() {
	vec4 data = texture2D(physicsData, gl_FragCoord.xy / bounds);

	vec2 position = data.xy;
	vec2 velocity = data.zw;

	position += velocity * 0.001;
#ifdef RESTRICT_POSITION
	position = clamp(position, -1.0, 1.0);
#endif

	vec2 dir = normalize(target - position);
	velocity += dir * 0.05;

	gl_FragColor = vec4(position, velocity);
}
