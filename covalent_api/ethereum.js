const axios = require('axios');
const BN = require('bn.js');
const fs = require('fs');
const { stringify } = require('csv-stringify');
const { parse } = require('path');

const WALLET_ADDRESS = "0x221a744df39f25df3eac9389f47d31d5dacf0041"

const FEED_URL = "https://api.covalenthq.com/v1/1/address/" + WALLET_ADDRESS + "/transactions_v2/?limit=10000&key=ckey_8615b3cbdebf4ff9a3b59e5785d";

const checkRouter = (logs) => {
    for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        if (log.decoded?.name == "Swap")
            return true;
    }
    return false;
}
const getBuyValue = (logs) => {
    try {
        const last_index = logs.length - 1;
        if (logs[last_index].sender_address == "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" &&
            logs[last_index].raw_log_topics[0] == "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c") {
            const value = parseInt(logs[last_index].raw_log_data);
            return value.toString();
        }
        else return 0;
    } catch (e) {
        console.log(e);
    }
}

const getSellValue = (logs) => {
    try {
        if (logs[0].sender_address == "0xc02aaa39b223fe8d0a0e5c4f27ead9083c756cc2" &&
            logs[0].raw_log_topics[0] == "0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65") {
            const value = parseInt(logs[0].raw_log_data);
            return value.toString();
        }
        else return 0;
    } catch (e) {
        console.log(e);
    }
}

const getLPAddress = (logs) => {
    for (let i = 0; i < logs.length; i++) {
        const log = logs[i];
        if (log.decoded?.name == "Swap") {
            return log.sender_address;
        }
    }

}

const addTokenList = (address, flag) => {
    if (flag == "buy") {
        if (typeof savedSellIndex[address] == "undefined")
            allTokens.push(address);
    }
    else if (flag == "sell") {
        if (typeof savedBuyIndex[address] == "undefined")
            allTokens.push(address);
    }
}

let dataset;

const MAX_TIME = "2050-02-08T19:59:41Z";

let resultTemplate = {
    tokenAddress: "Token Address",
    firstBuy: "First Buy",
    buyOrSell: "Buy/Sell",
    buyBNB: "WETH Buy",
    sellBNB: "WETH sell",
    profitBNB: "Profit ETH",
    profitPercent: "Profit %"
}

let overviewTemplate = {
    timeline: "Time",
    tokenCount: "Traded Tokens",
    profitToken: "Trade Rating"
}

function saveToCSV(outputData, resultTemplate, filename) {
    stringify(outputData, { header: true, columns: resultTemplate }, (err, output) => {
        if (err) throw err;
        fs.writeFile(filename, output, (err) => {
            if (err) throw err;
            console.log('walletTracking.csv saved.');
        });
    });
}

async function loadWalletData() {
    const response = await axios.get(FEED_URL);
    dataset = response.data.data;
}


function tradeAnalyze() {
    let tokenAddresses = [];
    let sellData = [];
    let buyData = [];
    let outputData = [];
    let buyDate = [];

    const transactions = dataset.items;
    const page = dataset.pagination;
    for (let i = 0; i < transactions.length; i++) {
        const transaction = transactions[i];
        if (transaction.from_address === WALLET_ADDRESS && checkRouter(transaction.log_events) && transaction.successful) {
            const token = getLPAddress(transaction.log_events);
            if (!tokenAddresses.includes(token)) {
                tokenAddresses.push(token);
                sellData[token] = 0;
                buyData[token] = 0;
                buyDate[token] = MAX_TIME
            }
            const sell = getSellValue(transaction.log_events);
            const buy = getBuyValue(transaction.log_events);
            if (buy != 0) {
                if (new Date(transaction.block_signed_at).getTime() < new Date(buyDate[token]).getTime())
                    buyDate[token] = transaction.block_signed_at;
            }
            sellData[token] = (new BN(sellData[token]).add(new BN(sell))).toString();
            buyData[token] = (new BN(buyData[token]).add(new BN(buy))).toString();
        }
    }
    for (let i = 0; i < tokenAddresses.length; i++) {
        const token = tokenAddresses[i];
        const buyBNB = buyData[token] / 10 ** 18;
        const sellBNB = sellData[token] / 10 ** 18;
        if (buyBNB == 0 && sellBNB == 0)
            continue;
        outputData.push({
            tokenAddress: token,
            firstBuy: buyDate[token] == MAX_TIME ? "None" : buyDate[token],
            buyOrSell: (parseFloat(buyBNB) > 0 ? "1" : "0") + "/" + (parseFloat(sellBNB) > 0 ? "1" : "0"),
            buyBNB: buyBNB,
            sellBNB: sellBNB,
            profitBNB: parseFloat(sellBNB) - parseFloat(buyBNB),
            profitPercent: parseFloat(buyBNB) != 0 ? ((parseFloat(sellBNB) - parseFloat(buyBNB)) / parseFloat(buyBNB)) * 100 : 100
        })
    }
    saveToCSV(outputData, resultTemplate, "walletPnL-ethereum.csv");
}

function getProfit(deadline, label) {
    const current = new Date().getTime();
    let tokenAddresses = [];
    let sellData = [];
    let buyData = [];
    const transactions = dataset.items;
    const page = dataset.pagination;
    for (let i = 0; i < transactions.length; i++) {
        const transaction = transactions[i];
        if (transaction.from_address === WALLET_ADDRESS && checkRouter(transaction.log_events) && transaction.successful) {
            if (new Date(transaction.block_signed_at).getTime() >= current - deadline * 3600 * 24 * 1000) {
                const token = getLPAddress(transaction.log_events);
                if (!tokenAddresses.includes(token)) {
                    tokenAddresses.push(token);
                    sellData[token] = 0;
                    buyData[token] = 0;
                }
                const sell = getSellValue(transaction.log_events);
                const buy = getBuyValue(transaction.log_events);
                sellData[token] = (new BN(sellData[token]).add(new BN(sell))).toString();
                buyData[token] = (new BN(buyData[token]).add(new BN(buy))).toString();
            }
        }
    }
    let profitCount = 0;
    for (let i = 0; i < tokenAddresses.length; i++) {
        const token = tokenAddresses[i];
        const buyBNB = buyData[token] / 10 ** 18;
        const sellBNB = sellData[token] / 10 ** 18;
        if (parseFloat(sellBNB) > parseFloat(buyBNB))
            profitCount++;
    }
    return { timeline: label, tokenCount: tokenAddresses.length, profitToken: profitCount.toString() + "/" + tokenAddresses.length.toString() }
}

function getProfitOverview() {
    let tradeData = [];
    tradeData.push(getProfit(1, "Last 24h"));
    tradeData.push(getProfit(7, "Last Week"));
    tradeData.push(getProfit(3650, "All"));
    saveToCSV(tradeData, overviewTemplate, "tradingOverview-ethereum.csv");
}

async function main() {
    await loadWalletData();
    tradeAnalyze();
    getProfitOverview();
}

main();