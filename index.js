const announce = require("./modules/announce");
const eventSync = require("./modules/eventSync");
const peerDiscover = require("./modules/peerDiscover");
const PouchDB = require("pouchdb");
const path = require("path");
const events = require("events");
const Level = require("abstract-level");

const { createHash } = require("crypto");
module.exports = class PapeerusEngine extends events.EventEmitter {
	constructor(config) {
		super();
		PouchDB.plugin(require("pouchdb-find"));
		this.config = config;
		this.port = config.port;
		this.host = config.host;
		this.bootstrap = config.bootstrap || [];
		this.debug = config.debug || false;
		this.eventTTL = config.eventTTL || 150000;
		this.dataDir = path.join(config.dataDir || process.cwd(), ".papeerus");
		this.datadb = new LocalStorage(path.join(this.dataDir, "data"));

		this.localdb = new PouchDB(path.join(this.dataDir, "meta"), {
			auto_compaction: false,
		});

		this.pollInterval = config.pollInterval || 10000;
		this.config = config;
	}
	async start() {
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
			this.bootstrap
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
	async broadcast(event) {
		let hash = createHash("sha256").update(Buffer.from(event)).digest("hex");
		try {
			if (await this.dbGet(`processedEvent:${hash}`)) {
				return;
			}
			await this.localdb.put({
				_id: `processedEvent:${hash}`,
				hash: hash,
			});
			await this.localdb.put({
				_id: "event:" + hash,
				hash,
				data: Buffer.from(event),
			});
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
