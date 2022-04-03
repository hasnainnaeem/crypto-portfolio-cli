import arg from 'arg';
import * as fs from 'fs';
import * as path from 'path';
import * as csv from 'fast-csv';
import {
    timeStamp
} from 'console';
const axios = require('axios');
const Pie = require("cli-pie");
const PRICE_API_URL = "https://min-api.cryptocompare.com/data/pricemulti?fsyms=BTC,ETH,XRP&tsyms=USD&API_KEY=a767ee7c4286d81bbb2e235a39f50e731e4d6f3d4b868509d6a619d965db6386";

/**
 * Argument Parsing and Flag Settings
 * @param {string} rawArgs 
 * @returns arguments object
 */
function parseArgumentsIntoOptions(rawArgs) {
    const args = arg({}, {
        argv: rawArgs.slice(2),
    });
    return {
        token: args._[0],
        date: args._[1]
    };
}

/**
 * 
 * @param {Object} portfolio - containing token:amount pairs
 * @param {Object} priceData - containig token:price pairs
 * @param {Int} currency 
 * @returns Object containing token:amount in currency
 */
async function getPortfolioAmounts(portfolio, priceData, currency = "USD") {
    for (const [symbol, amount] of Object.entries(portfolio)) {
        portfolio[symbol] *= priceData[symbol][currency];
    }
    return portfolio;
}

export async function cli(args) {
    let parameters = parseArgumentsIntoOptions(args);
    let inputDataStr = parameters["date"];
    let token = parameters["token"];
    let tokens = ["BTC", "ETH", "XRP"];

    // parse date and convert to epoch
    let inputDate = null;
    let inputEpoch = null;
    if (inputDataStr) {
        inputDate = new Date(inputDataStr);
        inputEpoch = Date.parse(inputDate) / 1000; // convert to seconds from milliseconds
    }
    // if no value provided to token variable or if it's set all, we make token null
    // to indicate that portfolio details of all tokens are requeste
    if (token.toLowerCase() == "none" || token.toLowerCase() == "all") {
        token = null;
    } else { // assume valid token
        token = token.toUpperCase();
        if(!tokens.includes(token)){
          console.log("Invalid command syntax. Please use this syntax: \nportfolio-handler-cli token-name date")
          process.exit();
        }
    }

    /**
     * Based on parameters, there are  cases:
     * 1. date and token provided
     * 2. date provied
     * 3. token provided
     */
    let portfolio = {
        "BTC": 0,
        "ETH": 0,
        "XRP": 0
    };

    let DataDirPath = "../data";
    let DataFileName = "transactions-chunk.csv";

    fs.createReadStream(path.resolve(__dirname, DataDirPath, DataFileName))
        .pipe(csv.parse({
            headers: true
        }))
        .on('error', error => console.error(error))
        .on('data', row => {
            /**
             * Note: we can check for cases outside reading stream to decrease run-time calculations
             * by using multiple reading stream blocks. But, that will add to code duplication which 
             * makes maintaining the code difficult.
             */
            if (token && inputDataStr) { // case 1
                if (token == row["token"] && inputEpoch >= row["timestamp"]) {
                    if (row["transaction_type"] == "DEPOSIT")
                        portfolio[row["token"]] += parseFloat(row["amount"]);
                    else if (row["transaction_type"] == "WITHDRAWAL")
                        portfolio[row["token"]] -= parseFloat(row["amount"]);
                }
            } else if (token) { // case 3
                if (token == row["token"]) {
                    if (row["transaction_type"] == "DEPOSIT")
                        portfolio[row["token"]] += parseFloat(row["amount"]);
                    else if (row["transaction_type"] == "WITHDRAWAL")
                        portfolio[row["token"]] -= parseFloat(row["amount"]);
                }
            } else if (inputDataStr) { // case 3
                if (row["transaction_type"] == "DEPOSIT")
                    portfolio[row["token"]] += parseFloat(row["amount"]);
                else if (row["transaction_type"] == "WITHDRAWAL")
                    portfolio[row["token"]] -= parseFloat(row["amount"]);
            }
        })
        .on('end', () => {
            axios.get(PRICE_API_URL).then(res => {
                let data = res["data"];
                // find portfolio values in USDs
                getPortfolioAmounts(portfolio, data).then(portfolio_amounts => {
                    console.log();
                    console.log("\tPortfolio Details")
                    console.log("------------------------------------")
                    // find total portfolio value and print portfolio values
                    let total_amount = 0;
                    for (const [symbol, amount] of Object.entries(portfolio_amounts)) {
                        console.log("\t" + symbol + ": " + (amount.toFixed(2)) + " USDs")
                        total_amount += amount;
                    }
                    console.log("\tTotal: " + (total_amount.toFixed(2)) + " USDs")
                    // find fractional portfolio value of each token 
                    let portfolio_fractions = {};
                    for (const [symbol, amount] of Object.entries(portfolio_amounts)) {
                        portfolio_fractions[symbol] = amount / total_amount;
                    }
                    // Generate a new pie, with radius 5 characters
                    let pieChart = new Pie(5, [{
                        label: "BTC",
                        value: portfolio_fractions["BTC"] * 100,
                        color: [0, 0, 255]
                    }, {
                        label: "ETH",
                        value: portfolio_fractions["ETH"] * 100,
                        color: [255, 240, 0]
                    }, {
                        label: "XRP",
                        value: portfolio_fractions["XRP"] * 100,
                        color: [255, 0, 0]
                    }], {
                        legend: true
                    });

                    // Stringify
                    console.log(pieChart.toString());
                })
            }).catch(error => {
                console.log(error);
            });
        });
}
