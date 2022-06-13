let { request } = require("undici");
module.exports = async function peerDiscover() {
	let listedPeers = await this.localdb.allDocs({
		startkey: "peer",
		endkey: "peer\ufff0",
		include_docs: true,
		attachments: true,
	});

	[...listedPeers.rows.map((peer) => peer.doc.host)].forEach(async (peer) => {
		try {
			let otherPeers = await (
				await request(`http://${peer}/peers`)
			).body.json();
			await this.localdb.bulkDocs(
				otherPeers
					.filter(
						(peer) =>
							!listedPeers.rows.find(
								(listedPeer) => listedPeer.doc.host == peer
							)
					)
					.map((peer) => ({
						_id: `peer:${peer}`,
						_rev: null,
						host: peer,
					}))
			);

			// console.log(3, otherPeers);
		} catch (e) {
			if (!this.debug) {
				return null;
			}

			return console.error(e);
		}
	});
};
