const PouchDB = require("pouchdb");
const { request } = require("undici");

module.exports = async function announce() {
	this._fastify = require("fastify")({
		logger: this.debug,
	});

	this._fastify.get("/peers", async (req, reply) => {
		let listedPeers = await this.localdb.allDocs({
			startkey: "peer:",
			endkey: "peer:\ufff0",
			include_docs: true,
			attachments: true,
		});
		return listedPeers.rows.map((peer) => peer.doc.host);
	});
	this._fastify.get("/announce/:peer", async (req) => {
		let peer = req.params.peer;
		try {
			await this.localdb.get(`peer:${peer}`);
		} catch (e) {
			try {
				await (await request(`http://${peer}/eventList`)).body.text();
			} catch (e) {
				if (this.config.debug) {
					return console.error(e);
				}
				return null;
			}
			await this.localdb.put({ _id: `peer:${peer}`, host: peer });

			return "ok";
		}

		// console.log(this.peers);
		return "ok";
	});
	this.startPeerDiscovering();
	// console.log(await this.localdb.getIndexes());
	this._fastify.listen(this.port, this.host);
	let announceToOtherPeers = async () => {
		let listedPeers = await this.localdb.allDocs({
			startkey: "peer",
			endkey: "peer\ufff0",
			include_docs: true,
			attachments: true,
		});
		try {
			for (peer of listedPeers.rows.map((peer) => peer.doc.host)) {
				try {
					await (
						await request(`http://${peer}/announce/${this.host}:${this.port}`)
					).body.text();
				} catch (e) {
					await this.localdb.remove(`peer:${peer}`);
					return null;
				}
			}
		} catch (e) {
			if (!this.debug) {
				return null;
			}
			return console.error(e);
		}
	};

	announceToOtherPeers();
	this.startEventSync();
	setInterval(() => announceToOtherPeers(), this.pollInterval);
	// console.log(this);
};
