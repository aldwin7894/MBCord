const request = require('request');

class MBClient {
	/**
	 * @param {Object} serverCredentials
	 * @param {string} serverCredentials.address
	 * @param {number} serverCredentials.port
	 * @param {string} serverCredentials.protocol HTTP or HTTPS
	 * @param {string} serverCredentials.username
	 * @param {string} serverCredentials.password
	 *
	 * @param {Object} deviceInfo
	 * @param {string} deviceInfo.deviceName
	 * @param {string} deviceInfo.deviceId
	 * @param {string} deviceInfo.deviceVersion,
	 * @param {string|undefined} deviceInfo.iconUrl URL to the icon displayed under the devices page
	 */
	constructor(serverCredentials, deviceInfo, cacheExpSecs = 900) {
		Object.assign(this, serverCredentials);
		Object.assign(this, deviceInfo);

		this.userId;
		this.accessToken;
		this.cacheExpSecs = cacheExpSecs;
		this.libraryIDCache = {};
		this.itemLibraryIDCache = {};
	}

	get serverAddress() {
		const url = new URL(`${this.protocol}://${this.address}`);
		url.port = this.port;
        return url.toString().replace(/\/+$/, '');
	}

	get isAuthenticated() {
		return this.accessToken !== undefined;
	}

	get headers() {
		const headers = {};

		headers['User-Agent'] = `${this.deviceName}/${this.deviceVersion}`;
		if(this.accessToken) headers['X-Emby-Token'] = this.accessToken;

		return headers;
	}

	static exchangeConnectToken(url, connectUserToken, connectUserId) {
		return new Promise((resolve, reject) => {
			request({
				url: url + `?format=json&ConnectUserId=${connectUserId}`,
				headers: {
					'x-emby-token': connectUserToken
				},
				json: true
			}, (err, res, body) => {
				if (err) return reject(err);
				if (res.statusCode !== 200)
					return reject(`Status: ${res.statusCode} Response: ${JSON.stringify(body)}`);

				resolve(body);
			});
		});
	}

	/**
	 * @returns {Promise<Array<Object>>} the sessions
	 */
	getSessions(activeWithinSeconds) {
		return new Promise((resolve, reject) => {
			request(
				`${this.serverAddress}/Sessions${activeWithinSeconds ? `?ActiveWithinSeconds=${activeWithinSeconds}` : ''}`,
				{
					headers: this.headers,
					json: true
				},
				(err, res, body) => {
					if (err) return reject(err);
					if (res.statusCode !== 200)
						return reject(`Status: ${res.statusCode} Response: ${JSON.stringify(body)}`);

					resolve(body);
				}
			);
		});
	}

	/**
	 * @returns {Promise<void>}
	 */
	assignDeviceCapabilities() {
		return new Promise((resolve, reject) => {
			request.post(
				`${this.serverAddress}/Sessions/Capabilities/Full`,
				{
					headers: this.headers,
					body: {
						IconUrl: this.iconUrl
					},
					json: true
				},
				(err, res) => {
					if (err) return reject(err);
					if (res.statusCode !== 204)
						return reject(`Status: ${res.statusCode} Reason: ${JSON.stringify(body)}`);

					resolve();
				}
			);
		});
	}

	/**
	 * @param {string} libraryId Library GUID
	 * @returns {Promise<string>} Internal ID
	 */
	getLibraryInternalId(libraryId) {
		// we have to do all this fucking bullshit just to get the library ID
		return new Promise((resolve, reject) => {
			const cacheResult = this.libraryIDCache[libraryId];
			if (cacheResult && cacheResult.expires > new Date().getTime()) {
				resolve(cacheResult.value);
			}

			request(
				`${this.serverAddress}/Users/${this.userId}/Items?Limit=1&ParentId=${libraryId}&Fields=ParentId`,
				{
					headers: this.headers,
					json: true
				},
				async (err, res, body) => {
					if (err) return reject(err);
					if (res.statusCode !== 200)
						return reject(`Status: ${res.statusCode} Response: ${JSON.stringify(body)}`);

					// some libraries might have no items
					if (!body.Items[0]) return resolve(null);

					try {
						// prettier-ignore
						const LibraryInternalID = await this.getItemInternalLibraryId(body.Items[0].Id);
						this.libraryIDCache[libraryId] = { value: LibraryInternalID, expires: new Date().getTime() + this.cacheExpSecs * 1000 };
						resolve(LibraryInternalID);
					} catch (error) {
						reject(`Failed to get library ID: ${error}`);
					}
				}
			);
		});
	}

	getSystemInfo() {
		return new Promise((resolve, reject) => {
			request(
				`${this.serverAddress}/System/Info`,
				{
					headers: this.headers,
					json: true
				},
				(err, res, body) => {
					if (err) return reject(err);
					if (res.statusCode !== 200)
						return reject(`Status: ${res.statusCode} Response: ${JSON.stringify(body)}`);

					resolve(body);
				}
			);
		});
	}

	/**
	 * @param {string} itemId ID of the item
	 * @returns {Promise<{
   *  libraryID: string,
   *  externalUrls?: {
   *    Name: string,
   *    Url: string
*      }[]
   * }>}
	 */
	getItemInternalLibraryId(itemId) {
		return new Promise((resolve, reject) => {
			const cacheResult = this.itemLibraryIDCache[itemId];
			if (cacheResult && cacheResult.expires > new Date().getTime()) {
				resolve(cacheResult.value);
			}

			request(
				`${this.serverAddress}/Items/${itemId}/Ancestors`,
				{
					headers: this.headers,
					json: true
				},
				(err, res, body) => {
					if (err) return reject(err);
					if (res.statusCode !== 200) {
            return reject(new Error(`Status: ${ res.statusCode } Response: ${ JSON.stringify(body) }`));
          }

					// second ancestor is always the library
          const libraryID = body.splice(body.length - 2, 1)[0]?.Id;
          if (!libraryID) return resolve(null);

          const parent = body.splice(body.length - 2, 1)?.[0];

          const value = {
            value: {
              libraryID,
              externalUrls: (parent?.ExternalUrls || []).filter(url => !url?.Name?.includes('Shoko'))
            },
            expires: new Date().getTime() + this.cacheExpSecs * 1000
          };
          this.itemLibraryIDCache[itemId] = value;
					resolve(value);
				}
			);
		});
	}

	/**
	 * @returns {Promise<Array<Object>>}
	 */
	getUserViews() {
		return new Promise((resolve, reject) => {
			request(
				`${this.serverAddress}/Users/${this.userId}/views`,
				{
					headers: this.headers,
					json: true
				},
				async (err, res, body) => {
					if (err) return reject(err);
					if (res.statusCode !== 200)
						return reject(`Status: ${res.statusCode} Response: ${JSON.stringify(body)}`);

					// undefined is for mixedcontent libraries (which dont have a collection type property for some reason?)
					// we dont want people to select libraries like playlist and collections since those are virtual libraries and not actual libraries
					const allowedLibraries = body.Items.filter(
						(view) =>
							view.CollectionType === undefined ||
							[
								'tvshows',
								'movies',
								'homevideos',
								'music',
								'musicvideos',
								'audiobooks'
							].includes(view.CollectionType)
					);

					const mappedLibraries = [];

					for (const library of allowedLibraries) {
						try {
							const internalId = await this.getLibraryInternalId(library.Id);

							// incase the library had no items and we couldnt figure out the ID
							if (internalId) {
								mappedLibraries.push({
									name: library.Name,
									id: internalId
								});
							}
						} catch (error) {
							reject(
								`Interal ID fetch failure: ${error} at library ${library.Name}`
							);
						}
					}

					resolve(mappedLibraries);
				}
			);
		});
	}

  getPrimaryImage(mediaId) {
    return `${this.serverAddress}/Items/${mediaId}/Images/Primary?width=512&quality=80&format=jpg`;
  }

	/**
	 * @returns {Promise<void>}
	 */
	login() {
		return new Promise((resolve, reject) => {
			if (this.accessToken) resolve();

			request.post(
				`${this.serverAddress}/Users/AuthenticateByName`,
				{
					headers: {
						Authorization: `Emby Client=Other, Device=${this.deviceName}, DeviceId=${this.deviceId}, Version=${this.deviceVersion}`
					},
					body: {
						Username: this.username,
						Pw: this.password
					},
					json: true
				},
				async (err, res, body) => {
					if (err) return reject(err);
					if (res.statusCode !== 200)
						return reject(`Status: ${res.statusCode} Response: ${JSON.stringify(body)}`);

					this.accessToken = body.AccessToken;
					this.userId = body.User.Id;

					if (this.iconUrl) {
						try {
							await this.assignDeviceCapabilities();
						} catch (error) {
							return reject(`Failed to set device icon: ${error}`);
						}
					}

					resolve(body);
				}
			);
		});
	}

	/**
	 * @returns {Promise<void>}
	 */
	logout() {
		return new Promise((resolve) => {
			this.userId = null;
			this.itemLibraryIDCache = {};
			this.libraryIDCache = {};

			if (this.accessToken) {
				request.post(
					`${this.serverAddress}/Sessions/Logout`,
					{
						headers: this.headers
					},
					() => {
						// i dont give a FUCK if it doesnt succeed, if it does, it does, if not, fuck it

						this.accessToken = null;
						resolve();
					}
				);
			} else {
				resolve();
			}
		});
	}
}

module.exports = MBClient;
