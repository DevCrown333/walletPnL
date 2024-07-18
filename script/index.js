const dotenv = require('dotenv')
const Moralis = require("moralis").default;
const { EvmChain } = require("@moralisweb3/common-evm-utils");
const fs = require('fs');
const { stringify } = require('csv-stringify');
const BN = require('bn.js');
const { tokenAbi } = require('./tokenAbi.js');
const Web3 = require('web3');
const { assert } = require('console');
const { exit } = require('process');
require('dotenv').config()

const MORALIS_KEY = process.env.MORALIS_API_KEY;
const WALLET_ADDRESS = process.env.WALLET_ADDRESS;

const web3 = new Web3(new Web3.providers.HttpProvider(process.env.REACT_APP_HTTP_PROVIDER));

let tokenBuyList = [];
let tokenSellList = [];
let duplicationCheckForBuy = [];
let duplicationCheckForSell = [];
let savedBuyIndex = [];
let savedSellIndex = [];
let allTokens = [];
let outputResult = [];

const getTokenMetadata = async (addresses) => {
    try {
        const chain = EvmChain.BSC;
        const response = await Moralis.EvmApi.token.getTokenMetadata({
            addresses,
            chain,
        });
        return response?.toJSON()[0];
    } catch (e) {
        console.log(e);
        return "not LP";
    }
}

const getTransactionValue = async (txHash) => {
    try {
        const chain = EvmChain.BSC;

        const response = await Moralis.EvmApi.transaction.getTransaction({
            transactionHash: txHash,
            chain,
        });

        const logs = response.toJSON()?.logs;
        if (logs[0].address == "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c" &&
            logs[0].topic0 == "0xe1fffcc4923d04b559f4d29a8bfc6cda04eb5b0d3c460751c2402c5c5cc9109c") {
            const value = parseInt(logs[0].data);
            return value.toString();
        }
    } catch (e) {
        console.log(e);
    }
}

const getTransferredValue = async (txHash) => {
    try {
        const chain = EvmChain.BSC;

        const response = await Moralis.EvmApi.transaction.getTransaction({
            transactionHash: txHash,
            chain,
        });

        const logs = response.toJSON()?.logs;
        const withdraw_index = logs.length - 1;
        if (logs[withdraw_index].address == "0xbb4cdb9cbd36b01bd1cbaebf2de08d9173bc095c" &&
            logs[withdraw_index].topic0 == "0x7fcf532c15f0a6db0bd6d0e038bea71d30d808c7d98cb3bf7268a95bf5081b65") {
            const value = parseInt(logs[withdraw_index].data);
            return value.toString();
        }
        // for (var i = 0; i < logs.length; i++) {

        // }

    } catch (e) {
        console.log(e);
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


let columns = {
    tokenName: 'tokenName',
    tokenDecimal: 'tokenDecimal',
    token: 'tokenAddress',
    amount: 'amount',
    BNB: 'BNB',
    timestamp: 'timestamp',
    txHash: 'txHash',

};

let resultTemplate = {
    TokenName: "Token Name",
    TokenAddress: "Token Address",
    FirstBuy: "First Buy",
    BuySell: "Buy/Sell",
    bnbBuy: "WBNB Buy",
    tokenBuy: "Token Buy",
    buyUsd: "Buy USD",
    bnbSell: "WBNB Sell",
    tokenSell: "Token Sell",
    sellUsd: "Sell USD",
    profitBNB: "Profit WBNB",
    profitUsd: "Profit USD",
    profitPercent: "Profit %"
}

const runApp = async () => {
    const wallet_address = WALLET_ADDRESS.toLowerCase();
    try {
        await Moralis.start({
            apiKey: MORALIS_KEY,
            // ...and any other configuration
        });

        const address = WALLET_ADDRESS;
        const chain = EvmChain.BSC;
        let cursor;
        let response;
        let index = 0;
        do {
            response = await Moralis.EvmApi.token.getWalletTokenTransfers({
                address,
                chain,
                limit: 100,
                cursor
            });
            cursor = response.toJSON().cursor;
            const history = response.toJSON()?.result;
            for (let i = 0; i < history.length; i++) {
                // buy
                if (history[i].to_address == wallet_address) {
                    const lpTokenData = await getTokenMetadata([history[i].from_address]);
                    if (lpTokenData.name == "Pancake LPs") {
                        if (duplicationCheckForBuy[history[i].address] != true) {
                            duplicationCheckForBuy[history[i].address] = true;
                            savedBuyIndex[history[i].address] = tokenBuyList.length;
                            addTokenList(history[i].address, "buy");
                            // const contract = new web3.eth.Contract(tokenAbi, history[i].address);
                            // const tokenName = await contract.methods.name().call();
                            const BNB_value = await getTransactionValue(history[i].transaction_hash);
                            tokenBuyList.push(
                                {
                                    // tokenName: tokenName,
                                    token: history[i].address,
                                    amount: history[i].value,
                                    BNB: BNB_value,
                                    timestamp: history[i].block_timestamp,
                                    txHash: history[i].transaction_hash,
                                })
                        }
                        else {
                            const originToken = new BN(tokenBuyList[savedBuyIndex[history[i].address]].amount);
                            const newBalance = new BN(history[i].value);
                            tokenBuyList[savedBuyIndex[history[i].address]].amount = (originToken.add(newBalance)).toString();
                            const originBNB = new BN(tokenBuyList[savedBuyIndex[history[i].address]].BNB);
                            const BNB_value = await getTransactionValue(history[i].transaction_hash);
                            const newBNB = new BN(BNB_value);
                            tokenBuyList[savedBuyIndex[history[i].address]].BNB = (originBNB.add(newBNB)).toString();
                        }
                    }
                }
                // sell
                else if (history[i].from_address == wallet_address) {
                    const lpTokenData = await getTokenMetadata([history[i].to_address]);
                    if (lpTokenData.name == "Pancake LPs") {
                        if (duplicationCheckForSell[history[i].address] != true) {
                            duplicationCheckForSell[history[i].address] = true;
                            savedSellIndex[history[i].address] = tokenSellList.length;
                            addTokenList(history[i].address, "sell");
                            // const contract = new web3.eth.Contract(tokenAbi, history[i].address);
                            // const tokenName = await contract.methods.name().call();
                            const BNB_value = await getTransferredValue(history[i].transaction_hash);
                            tokenSellList.push(
                                {
                                    // tokenName: tokenName,
                                    token: history[i].address,
                                    amount: history[i].value,
                                    BNB: BNB_value,
                                    timestamp: history[i].block_timestamp,
                                    txHash: history[i].transaction_hash,
                                })
                        }
                        else {
                            const originToken = new BN(tokenSellList[savedSellIndex[history[i].address]].amount);
                            const newBalance = new BN(history[i].value);
                            tokenSellList[savedSellIndex[history[i].address]].amount = (originToken.add(newBalance)).toString();
                            const originBNB = new BN(tokenSellList[savedSellIndex[history[i].address]].BNB);
                            const BNB_value = await getTransferredValue(history[i].transaction_hash);
                            const newBNB = new BN(BNB_value);
                            tokenSellList[savedSellIndex[history[i].address]].BNB = (originBNB.add(newBNB)).toString();
                        }
                    }
                }
            }
            if (++index == 10)
                break;
        } while (cursor != null)
    } catch (e) {
        console.log(e);
    }

    for (let j = 0; j < allTokens.length; j++) {
        const tokenAddress = allTokens[j];
        const buyInfo = typeof savedBuyIndex[tokenAddress] == "undefined" ? null : tokenBuyList[savedBuyIndex[tokenAddress]];
        const sellInfo = typeof savedSellIndex[tokenAddress] == "undefined" ? null : tokenSellList[savedSellIndex[tokenAddress]];
        const row = {
            // TokenName: buyInfo == null ? sellInfo.tokenName : buyInfo.tokenName,
            TokenAddress: buyInfo == null ? sellInfo.token : buyInfo.token,
            FirstBuy: buyInfo == null ? sellInfo.timestamp : buyInfo.timestamp,
            BuySell: (buyInfo != null ? "1" : "0") + "/" + (sellInfo != null ? "1" : "0"),
            bnbBuy: buyInfo != null ? buyInfo.BNB / 10 ** 18 : "0",
            bnbSell: sellInfo != null ? sellInfo.BNB / 10 ** 18 : "0",
            profitBNB: "Profit WBNB",
            profitPercent: "Profit %"
        }
        row.profitBNB = (row.bnbSell - row.bnbBuy);
        row.profitPercent = ((row.profitBNB / row.bnbBuy) * 100);

        outputResult.push(row);
    }

    // console.log(tokenBuyList);
    stringify(outputResult, { header: true, columns: resultTemplate }, (err, output) => {
        if (err) throw err;
        fs.writeFile('walletPnL.csv', output, (err) => {
            if (err) throw err;
            console.log('walletTracking.csv saved.');
        });
    });

    // console.log(tokenSellList);
    // stringify(tokenSellList, { header: true, columns: columns }, (err, output) => {
    //     if (err) throw err;
    //     fs.writeFile('walletTrackingSell.csv', output, (err) => {
    //         if (err) throw err;
    //         console.log('walletTracking.csv saved.');
    //     });
    // });
};

runApp();