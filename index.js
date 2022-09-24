const express = require('express');
const app = express();
app.use(express.json())
require('dotenv').config();
const https = require("https");
const CyclicDb = require("cyclic-dynamodb")
const db = CyclicDb("rich-ruby-camel-robeCyclicDB")
const lirarateDB = db.collection("lirarate")

app.get('/lirarate', async (req, res) => {
	let responseJson = {};
	if (process.env.DISABLE_SCRIPT == "false") {
		let requestBody = req.body;

		let lirarateStatus = await lirarateDB.get("status")

		let pattern = lirarateStatus != null && lirarateStatus.props != null && lirarateStatus.props.pattern != null ? lirarateStatus.props.pattern : ["D"];
		console.log("pattern", pattern);

		let lirarate = lirarateStatus != null && lirarateStatus.props != null && lirarateStatus.props.lirarate != null ? lirarateStatus.props.lirarate : 1500;
		console.log("lirarate", lirarate);

		getLiraRate(pattern, lirarate);
		
		console.log("Script done!")
		responseJson.status = "success";
	} else {
		console.log("Script disabled!")
		responseJson.status = "disabled";
	}
	res.setHeader('Content-Type', 'application/json');
	res.send(JSON.stringify(responseJson));
});
app.get('/lirarate-pattern', async (req, res) => {
		let responseJson = {};
		let requestBody = req.body;

		let lirarateStatus = await lirarateDB.get("status");
		responseJson.status = "success";
		responseJson.pattern = lirarateStatus != null && lirarateStatus.props != null && lirarateStatus.props.pattern != null ? lirarateStatus.props.pattern : null;
		res.setHeader('Content-Type', 'application/json');
		res.send(JSON.stringify(responseJson));
})
app.listen(process.env.PORT || 3000)

function iftttWebhook(jsonData) {
	const data = JSON.stringify(jsonData);

	const postOptions = {
		hostname: 'maker.ifttt.com',
		port: 443,
		path: '/trigger/notification/json/with/key/' + process.env.IFTTT_WEBHOOK_KEY,
		method: 'POST',
		headers: {
			'Content-Type': 'application/json'
		}
	}

	const req = https.request(postOptions, res => {
		res.on('data', d => {
		})
	});

	req.on('error', error => {
		console.error(error);
		throw error;
	})

	req.write(data)
	req.end()
}

function getLiraRate(pattern, lirarate) {
	const data = JSON.stringify({});

	const postOptions = {
		hostname: 'api.scriptrapps.io',
		port: 443,
		path: '/liraRate/latest',
		method: 'POST',
		headers: {
			'Authorization': 'bearer ' + process.env.SCRIPTR_TOKEN,
			'Content-Type': 'application/json'
		}
	}

	const req = https.request(postOptions, res => {
		var body = '';

		res.on('data', d => {
			body += d;
		})

		res.on('end', async function(){
			var jsonResponse = JSON.parse(body);
			if (jsonResponse != null) {
				let lastUpdatedSince = jsonResponse.lastUpdatedSince;
				let sell = jsonResponse.sell;
				let patternUpdated = false;

				if (pattern.length > 2 && pattern[pattern.length - 1] == "D" && pattern[pattern.length - 2] == "D" && pattern[pattern.length - 3] == "D" && sell > lirarate) {
					pattern = ["U"];
					patternUpdated = true;
				} else if (pattern.length > 2 && pattern[pattern.length - 1] == "U" && pattern[pattern.length - 2] == "U" && pattern[pattern.length - 3] == "U" && sell < lirarate) {
					pattern = ["D"];
					patternUpdated = true;
					console.log("PEAKED AT", lirarate);
					iftttWebhook({message: "Peaked at: " + lirarate});
				} else if (pattern.length > 2 && pattern[pattern.length - 1] == "U" && pattern[pattern.length - 2] == "U" && pattern[pattern.length - 3] == "U" && sell > lirarate) {
					pattern.push("U");
					patternUpdated = true;
					console.log("STILL GOING UP", lirarate);
					iftttWebhook({message: "Still going up: " + lirarate});
				} else if (sell > lirarate) {
					pattern.push("U");
					patternUpdated = true;
				} else if (sell < lirarate) {
					pattern.push("D");
					patternUpdated = true;
				}

				console.log("pattern", pattern, patternUpdated, lirarate, sell);

				if (patternUpdated) {
					console.log("updatingPattern", pattern, sell);
					let lirarateStatus = await lirarateDB.set("status", {
							pattern: pattern,
							lirarate: sell
					});
					console.log("lirarateStatus", lirarateStatus);
				}
			}
		});
	});

	req.on('error', error => {
		console.error(error);
		throw error;
	})

	req.write(data)
	req.end()
}