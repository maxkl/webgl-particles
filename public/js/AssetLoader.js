var AssetLoader = (function () {
	'use strict';

	var loaders = {
		'img': function (url) {
			return new Promise(function (resolve, reject) {
				var img = new Image();
				img.onload = function () {
					img.onload = img.onerror = null;
					resolve(img);
				};
				img.onerror = function () {
					reject(new Error('Image failed to load'));
				};
				img.src = url;
			});
		},
		'txt': function (url) {
			return new Promise(function (resolve, reject) {
				var req = new XMLHttpRequest();
				req.onload = function () {
					if(req.status === 200) {
						resolve(req.responseText);
					} else {
						reject(new Error('Server error: ' + req.status));
					}
				};
				req.onerror = function () {
					reject(new Error('Client/network error'));
				};
				req.open('GET', url);
				req.send();
			});
		}
	};

	function AssetLoader() {
		this.assets = {};
	}

	AssetLoader.prototype.load = function (type, url, alias) {
		if(!loaders[type]) {
			throw new Error('Invalid asset type');
		}

		if(!alias) {
			alias = url;
		}

		var self = this;
		return loaders[type](url).then(function (asset) {
			self.assets[alias] = asset;
		});
	};

	AssetLoader.prototype.loadAll = function(assets) {
		var self = this;
		return Promise.all(assets.map(function (asset) {
			return self.load(asset[0], asset[1], asset[2]);
		}))
	};

	return AssetLoader;
})();