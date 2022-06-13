const announce = require("./modules/announce");
const eventSync = require("./modules/eventSync");
const peerDiscover = require("./modules/peerDiscover");
const PouchDB = require("pouchdb");
const path = require("path");
const events = require("events");
const { createHash } = require("crypto");
module.exports = class PapeerusEngine extends events.EventEmitter {
	constructor(config) {
		super();
		this.config = config;
		this.port = config.port;
		this.host = config.host;
		this.debug = config.debug || false;
		this.dataDir = path.join(config.dataDir || process.cwd(), ".papeerus");
		this.localdb = new PouchDB(this.dataDir, {
			auto_compaction: true,
			revs_limit: 1,
		});

		this.pollInterval = config.pollInterval || 3000;
		this.config = config;
	}
	async announce() {
		announce.apply(this);
	}
	async startPeerDiscovering() {
		let listedPeers = await this.localdb.allDocs({
			startkey: "peer:",
			endkey: "peer:\ufff0",
			include_docs: true,
			attachments: true,
		});

		await this.localdb.bulkDocs(
			this.config.bootstrap
				.filter(
					(peer) =>
						!listedPeers.rows.find((listedPeer) => listedPeer.doc.host == peer)
				)
				.map((peer) => {
					return {
						_id: `peer:${peer}`,
						_rev: null,
						host: peer,
					};
				})
		);
		peerDiscover.apply(this);
		setInterval(() => peerDiscover.apply(this), this.pollInterval);
	}
	async startEventSync() {
		eventSync.apply(this);
	}
	async broadcastEvent(event) {
		let hash = createHash("sha256").update(Buffer.from(event)).digest("hex");
		try {
			if (await this.dbGet(`processedEvent:${hash}`)) {
				return;
			}
			await this.localdb.put({
				_id: `processedEvent:${hash}`,
				hash: hash,
			});
			await this.localdb.putAttachment(
				"event:" + hash,
				"data.bin",
				Buffer.from(event)
			);
		} catch (e) {
			console.error(e);
		}
	}
	async dbGet(id) {
		try {
			return await this.localdb.get(id);
		} catch (e) {
			return null;
		}
	}
};
