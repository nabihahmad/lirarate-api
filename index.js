const express = require('express');
const app = express();
app.use(express.json())
require('dotenv').config();
const https = require("https");
const CyclicDb = require("cyclic-dynamodb")
const db = CyclicDb("rich-ruby-camel-robeCyclicDB")
const lirarateDB = db.collection("lirarate")

app.get('/lirarate', async (req, res) => {
	let checkTime = req.query.time;
	if (checkTime != null) {
		/*
		var strDate = checkTime.split(", ")[0];
		var strDay = strDate.split("/")[0];
		var strMonth = strDate.split("/")[1];
		var strYear = strDate.split("/")[2];
		var strTime = checkTime.split(", ")[1];
		var strHour = strTime.split(":")[0];
		var strAmPm = strTime.split(":")[1].split(" ")[1];
		if (strAmPm == "PM")
			strHour = parseInt(strHour) + 12;
		var strMinute = strTime.split(":")[1].split(" ")[0];
		checkTime = new Date(strYear+"-"+strMonth+"-"+strDay+"T"+strHour+":"+strMinute);
		*/
		checkTime = checkTime.replace(" ", "+");
		checkTime = new Date(checkTime);
	}

	let responseJson = {};
	if (process.env.DISABLE_SCRIPT == "false") {
		responseJson = await fetchLiraRate().then(response => {
			return parseLiraRate(response, checkTime);
		}).catch(error => {
			console.log("error", error);
		});
	} else {
		console.log("Script disabled!")
		responseJson.status = "disabled";
	}
	res.setHeader('Content-Type', 'application/json');
	res.send(JSON.stringify(responseJson));
});

app.get('/lirarate-status', async (req, res) => {
	let responseJson = {};
	if (process.env.DISABLE_SCRIPT == "false") {
		let requestBody = req.body;

		let lirarateStatus = await lirarateDB.get("status")

		let pattern = lirarateStatus != null && lirarateStatus.props != null && lirarateStatus.props.pattern != null ? lirarateStatus.props.pattern : ["D"];
		console.log("pattern", pattern);

		let lirarate = lirarateStatus != null && lirarateStatus.props != null && lirarateStatus.props.lirarate != null ? lirarateStatus.props.lirarate : 1500;
		console.log("lirarate", lirarate);

		await getLiraRateStatus(pattern, lirarate);
		
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
});

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

function getHoursTimestamp() {
    var today = new Date();
    return "t" + today.getFullYear() + (today.getMonth()+1) + today.getDate() + today.getHours();
}

function convertTimeZone(date) {
    var options = {"weekday": "long", "year": "numeric", "month": "long", "day": "numeric", "hour": "numeric", "minute": "numeric", "timeZone": "Asia/Beirut"};
    var latestTimestamp = new Date(date).toLocaleString("en-US", options);
    return latestTimestamp;
}

function getElapsedTime(timestamp) {
    var delta = Math.abs((new Date()).getTime() - timestamp) / 1000;

    var days = Math.floor(delta / 86400);
    delta -= days * 86400;

    var hours = Math.floor(delta / 3600) % 24;
    delta -= hours * 3600;

    var minutes = Math.floor(delta / 60) % 60;
    delta -= minutes * 60;
    
    return days + " days " + hours + " hours " + minutes + " minutes ago";
}

function parseLiraRate(jsonResponse, checkTime) {
	let jsonParsedResponse = {};
	try {
		var data = jsonResponse.lirarate;
		if (checkTime != null) {
            var buyRate = 0, sellRate = 0, buyRateDate = null, sellRateDate = null, lastUpdatedSinceTimestamp = null;
            for (var i = 0; i < data.sell.length; i++) {
                if (data.sell[i][0] >= checkTime) {
                    sellRate = data.sell[i][1];
                    lastUpdatedSinceTimestamp = data.sell[i][0];
                    sellRateDate = convertTimeZone(data.sell[i][0]);
                    break;
                }
            }
            
            for (var i = 0; i < data.buy.length; i++) {
                if (data.buy[i][0] >= checkTime) {
                    buyRate = data.buy[i][1];
                    lastUpdatedSinceTimestamp = data.buy[i][0];
                    buyRateDate = convertTimeZone(data.buy[i][0]);
                    break;
                }
            }
            
            if (buyRateDate != null && sellRateDate != null)
	            jsonParsedResponse = {"buy": buyRate, "sell": sellRate, "lastUpdatedAt": (sellRateDate != null ? sellRateDate : buyRateDate), "lastUpdatedSince": (lastUpdatedSinceTimestamp != null ? getElapsedTime(lastUpdatedSinceTimestamp) : null)};
        } else {
			jsonParsedResponse = {"sell": data.sell[data.sell.length - 1][1], "buy": data.buy[data.buy.length - 1][1], "lastUpdatedAt": convertTimeZone(data.buy[data.buy.length - 1][0]), "lastUpdatedSince": getElapsedTime(data.buy[data.buy.length - 1][0])};
		}
	} catch (e) {
		console.error(e)
	}
	return jsonParsedResponse;
}

function getLiraRateStatus(pattern, lirarate) {
	const data = JSON.stringify({"testKey": "testValue"});

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

function fetchLiraRate() {
	return new Promise((resolve, reject) => {
		const options = {
			hostname: 'lirarate.org',
			path: '/wp-json/lirarate/v2/all?currency=LBP&_ver='+getHoursTimestamp(),
			headers: {
				'Authorization': 'Bearer ' + process.env.LIRARATE_TOKEN,
				'Content-Type': 'application/json',
				"referer": "https://lirarate.org/"
			}
		}

		https.get(options, (res) => {
			var { statusCode } = res;
			var contentType = res.headers['content-type'];

			let error;

			if (statusCode !== 200) {
				error = new Error('Request Failed.\n' + `Status Code: ${statusCode}`);
			} else if (!/^application\/json/.test(contentType)) {
				error = new Error('Invalid content-type.\n' + `Expected application/json but received ${contentType}`);
			}

			if (error) {
				console.error(error.message);
				// consume response data to free up memory
				res.resume();
			}
			
			res.setEncoding('utf8');
			let rawData = '';
			
			res.on('data', (chunk) => {
				rawData += chunk;
			});
			
			res.on('end', () => {
				try {
					const parsedData = JSON.parse(rawData);
					resolve(parsedData);
				} catch (e) {
					reject(e.message);
				}
			});
		}).on('error', (e) => {
			reject(`Got error: ${e.message}`);
		});
	});
}
