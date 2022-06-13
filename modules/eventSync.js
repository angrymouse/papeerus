let { request } = require("undici");
const { createHash } = require("crypto");
module.exports = async function eventSync() {
	this._fastify.get("/eventsList", async (req) => {
		let eventList = await this.localdb.allDocs({
			startkey: "event:",
			endkey: "event:\ufff0",
		});

		return eventList.rows.map((e) => e.id.split(":")[1]);
	});
	this._fastify.get("/events/:hash", async (req, res) => {
		let hash = req.params.hash;
		try {
			return await this.localdb.getAttachment("event:" + hash, "data.bin");
		} catch (e) {
			console.error(e);
			return "Data not found";
		}
	});

	let syncFromOtherPeers = async () => {
		let listedPeers = await this.localdb.allDocs({
			startkey: "peer",
			endkey: "peer\ufff0",
			include_docs: true,
			attachments: true,
		});
		try {
			for (peer of listedPeers.rows.map((peer) => peer.doc.host)) {
				let events = await (
					await request(`http://${peer}/eventsList`)
				).body.json();
				let nonUniqueEvents = await this.localdb.allDocs({
					startkey: "processedEvent:",
					endkey: "processedEvent:\ufff0",
					include_docs: true,
					attachments: true,
				});
				let uniqueEvents = events.filter((event) => {
					return !nonUniqueEvents.rows.find((nonUniqueEvent) => {
						return nonUniqueEvent.doc.hash == event;
					});
				});
				// console.log(1, uniqueEvents, events);
				for (let hash of uniqueEvents) {
					try {
						let event = await (
							await request(`http://${peer}/events/${hash}`)
						).body.arrayBuffer();

						let calculatedHash = createHash("sha256")
							.update(event)
							.digest("hex");

						if (calculatedHash !== hash) {
							return;
						}
						let data = Buffer.from(event);

						// console.log(calculatedHash, Buffer.from(event).toString());
						await this.localdb.put({
							_id: `processedEvent:${hash}`,
							hash: hash,
						});
						await this.localdb.putAttachment("event:" + hash, "data.bin", data);
						this.emit("newDataInNetwork", data);
					} catch (e) {
						// if (!this.debug) {
						// 	return null;
						// }
						return console.error(e);
					}
				}
				// console.log(events);
			}
		} catch (e) {
			if (!this.debug) {
				return null;
			}
			return console.error(e);
		}
	};
	syncFromOtherPeers();
	setInterval(syncFromOtherPeers, this.pollInterval);
};
