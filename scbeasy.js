const axios = require('axios');
const { Module } = require('module');
const NodeCache = require('node-cache');
const cache = new NodeCache();

class SCBEASY {
    constructor(deviceId, pin, encrypt = null, BankType, web) {
        this.deviceId = deviceId;
        this.pin = pin;
        this.encrypt = encrypt || "https://encrypt.scb.asia/pin/encrypt";

        if (BankType === 'deposit') {
            this.BankType = 'deposit';
            this.key = 'api_auth_deposit';
        } else {
            this.BankType = 'withdraw';
            this.key = 'api_auth_withdraw';
        }

        this.web = web;
        this.tilesVersion = "70";
        this.useragent = "Android/11;FastEasy/3.74.0/7766";
    }

    async deleteCacheLogin() {
        cache.del(this.key);
    }

    async setCacheLogin(Auth) {
        cache.set(this.key, Auth, 60 * 60 * 24); // Cache for 24 hours
    }

    async getCacheLogin() {
        return cache.get(this.key);
    }

    async login() {
        const headers = {
            'Accept-Language': 'th',
            'scb-channel': 'APP',
            'User-Agent': this.useragent,
            'Content-Type': 'application/json; charset=UTF-8',
            'Host': 'fasteasy.scbeasy.com:8443',
            'Connection': 'Keep-Alive',
            'Accept-Encoding': 'gzip',
        };

        const data = {
            "tilesVersion": this.tilesVersion,
            "userMode": "INDIVIDUAL",
            "isLoadGeneralConsent": "1",
            "deviceId": this.deviceId,
            "jailbreak": "0"
        };

        try {
            const response = await axios.post("https://fasteasy.scbeasy.com/v3/login/preloadandresumecheck", data, { headers });
            const Auth = response.headers['api-auth'];

            if (!Auth) {
                throw new Error("Api-Auth header not found in response");
            }

            const secondUrl = "https://fasteasy.scbeasy.com/isprint/soap/preAuth";
            const secondData = { "loginModuleId": "PseudoFE" };
            headers['Api-Auth'] = Auth;

            const secondResponse = await axios.post(secondUrl, secondData, { headers });
            const { pseudoOaepHashAlgo, pseudoSid, pseudoRandom, pseudoPubKey } = secondResponse.data.e2ee;

            const thirdUrl = this.encrypt;
            const thirdData = `Sid=${pseudoSid}&ServerRandom=${pseudoRandom}&pubKey=${pseudoPubKey}&pin=${this.pin}&hashType=${pseudoOaepHashAlgo}`;
            const thirdResponse = await axios.post(thirdUrl, thirdData, { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
            const pseudoPin = thirdResponse.data;

            const fourthUrl = "https://fasteasy.scbeasy.com/v1/fasteasy-login";
            const fourthData = {
                "pseudoPin": pseudoPin,
                "tilesVersion": this.tilesVersion,
                "pseudoSid": pseudoSid,
                "deviceId": this.deviceId
            };
            const fourthResponse = await axios.post(fourthUrl, fourthData, { headers });

            const finalAuth = fourthResponse.headers['api-auth'];
            if (!finalAuth) {
                await this.deleteCacheLogin();
                await this.login()
                throw new Error("Final Api-Auth header not found in response");
            }

            await this.setCacheLogin(finalAuth);
            return finalAuth;
        } catch (error) {
            console.error("Error:", error);
            throw error; // Re-throw the error for further handling
        }
    }


    async getAccounts() {
        try {
            const Auth = await this.getCacheLogin();
            const headers = {
                'Accept-Language': 'th',
                'scb-channel': 'app',
                'User-Agent': this.useragent,
                'Host': 'fasteasy.scbeasy.com:8443',
                'Connection': 'Keep-Alive',
                'Accept-Encoding': 'gzip',
                'Api-Auth': Auth,
                'Content-Type': 'application/json; charset=UTF-8'
            };
            const data = {};
            const url = `https://fasteasy.scbeasy.com/v3/profiles/accounts/registered?tilesVersion=${this.tilesVersion}`;
            const response = await axios.get(url, { headers });
            const result = response.data;
    
            if (result.status.description === "คุณไม่ได้ทำรายการในเวลาที่กำหนด หรือได้ออกจากระบบแล้ว โปรด Login อีกครั้ง") {
                await this.deleteCacheLogin();
                await this.login();
                return this.getAccounts();
            } else {


                const arr = {
                    "Auth": Auth,
                    "accountNo": result.depositList[0].accountNo
                };
                return arr;
            }
        } catch (error) {
            console.error("Error:", error);
            throw error; // Re-throw the error for further handling
        }
    }

    async getDashboard() {
        try {
            const accountNo = await this.getAccounts();
            const headers = {
                'Accept-Language': 'th',
                'scb-channel': 'app',
                'User-Agent': this.useragent,
                'Host': 'fasteasy.scbeasy.com:8443',
                'Connection': 'Keep-Alive',
                'Accept-Encoding': 'gzip',
                'Api-Auth': accountNo.Auth,
                'Content-Type': 'application/json; charset=UTF-8'
            };
            const data = {
                "tilesVersion": this.tilesVersion,
                "numberRecentTxn": 2,
                "depositList": [{ "accountNo": accountNo.accountNo }],
                "latestTransactionFlag": "false"
            };
            const url = "https://fasteasy.scbeasy.com/v2/deposits/summary";
            const response = await axios.post(url, data, { headers });
            return response.data;
        } catch (error) {
            console.error("Error:", error);
            throw error; // Re-throw the error for further handling
        }
    }
    
    async getQuickBalance() {
        try {
            const Auth = await this.getCacheLogin();
            const headers = {
                'Accept-Language': 'th',
                'scb-channel': 'app',
                'User-Agent': this.useragent,
                'Host': 'fasteasy.scbeasy.com:8443',
                'Connection': 'Keep-Alive',
                'Accept-Encoding': 'gzip',
                'Api-Auth': Auth,
                'Content-Type': 'application/json; charset=UTF-8'
            };
            const url = "https://fasteasy.scbeasy.com/v1/profiles/quickbalance";
            const response = await axios.get(url, { headers });
            return response.data;
        } catch (error) {
            console.error("Error:", error);
            throw error; // Re-throw the error for further handling
        }
    }
    
    async Transactions(start = null, end = null, page = 1, limit = null) {
        try {
            const accountNo = await this.getAccounts();
            if (!start) {
                start = new Date();
                start.setDate(start.getDate() - 1);
                start = start.toISOString().split('T')[0]
            }
            if (!end) {
                end = new Date();
                end.setDate(end.getDate() + 1);
                end = end.toISOString().split('T')[0]
            }

            console.log(start);
            console.log(end);
            const headers = {
                'Accept-Language': 'th',
                'scb-channel': 'app',
                'User-Agent': this.useragent,
                'Host': 'fasteasy.scbeasy.com:8443',
                'Connection': 'Keep-Alive',
                'Accept-Encoding': 'gzip',
                'Api-Auth': accountNo.Auth,
                'Content-Type': 'application/json; charset=UTF-8'
            };
            const data = {
                "pageSize": limit,
                "productType": 2,
                "pageNumber": page,
                "accountNo": accountNo.accountNo,
                "startDate": start,
                "endDate": end
            };
            const url = "https://fasteasy.scbeasy.com/v2/deposits/casa/transactions";
            const response = await axios.post(url, data, { headers });
            return response.data;
        } catch (error) {
            console.error("Error:", error);
            throw error; // Re-throw the error for further handling
        }
    }

    
    async BillScan(data) {
        try {
            const Auth = await this.getCacheLogin();
            if (!data) {
                throw new Error("ไม่มีข้อมูล QRCode");
            }
            const headers = {
                'Accept-Language': 'th',
                'scb-channel': 'app',
                'User-Agent': this.useragent,
                'Host': 'fasteasy.scbeasy.com:8443',
                'Connection': 'Keep-Alive',
                'Accept-Encoding': 'gzip',
                'Api-Auth': Auth,
                'Content-Type': 'application/json; charset=UTF-8'
            };
            const requestData = {
                "tilesVersion": this.tilesVersion,
                "barcode": data,
            };
            const url = "https://fasteasy.scbeasy.com/v7/payments/bill/scan";
            const response = await axios.post(url, requestData, { headers });
            return response.data;
        } catch (error) {
            if (error.response && error.response.data) {
                const result = error.response.data;
                if (result.status.description === "คุณไม่ได้ทำรายการในเวลาที่กำหนด หรือได้ออกจากระบบแล้ว โปรด Login อีกครั้ง") {
                    await this.deleteCacheLogin();
                    await this.login();
                    return this.BillScan(data);
                }
                return result;
            } else {
                console.error("Error:", error.message);
                throw error;
            }
        }
    }

    async getBankCode() {
        try {
            const Auth = await this.getCacheLogin();
            const headers = {
                'Accept-Language': 'th',
                'scb-channel': 'app',
                'User-Agent': this.useragent,
                'Host': 'fasteasy.scbeasy.com:8443',
                'Connection': 'Keep-Alive',
                'Accept-Encoding': 'gzip',
                'Api-Auth': Auth,
                'Content-Type': 'application/json; charset=UTF-8'
            };
            const url = "https://fasteasy.scbeasy.com/v1/transfer/eligiblebanks";
            const response = await axios.get(url, { headers });
            const responseData = response.data;
            if (responseData.status.description === "คุณไม่ได้ทำรายการในเวลาที่กำหนด หรือได้ออกจากระบบแล้ว โปรด Login อีกครั้ง") {
                await this.deleteCacheLogin();
                await this.login();
                return this.getBankCode();
            } else {
                if (responseData.status.code === "1000") {
                    const banks = responseData.data;
                    const list = banks.map(data => ({
                        bankCode: data.bankCode,
                        bankName: data.bankName.replace("\n", ""),
                        bankLogo: this.getImagePath(data.bankLogo)
                    }));
                    return list
                } else {
                    return responseData
                }
            }
        } catch (error) {
            console.error("Error:", error.message);
            throw error;
        }
    }

    async TransferConfirmation(accno, bankcode, amount) {
        try {
            const accountNo = await this.getAccounts();
            if (!accno || !bankcode || !amount) {
                throw new Error("Please provide complete information");
            }
            const transfer_type = (bankcode === "014") ? "3RD" : "ORFT";
            const headers = {
                'Accept-Language': 'th',
                'scb-channel': 'app',
                'User-Agent': this.useragent,
                'Host': 'fasteasy.scbeasy.com:8443',
                'Connection': 'Keep-Alive',
                'Accept-Encoding': 'gzip',
                'Api-Auth': accountNo.Auth,
                'Content-Type': 'application/json; charset=UTF-8'
            };
            const data = {
                "accountFromType": 2,
                "amount": amount,
                "annotation": null,
                "transferType": transfer_type,
                "accountToBankCode": bankcode,
                "accountFrom": accountNo.accountNo,
                "accountTo": accno
            };
            const verificationUrl = "https://fasteasy.scbeasy.com/v2/transfer/verification";
            let resp = await axios.post(verificationUrl, data, { headers });
            let responseData = resp.data;
            if (responseData.status.description === "จำนวนเงินในบัญชีไม่เพียงพอ กรุณาเลือกบัญชีอื่น") {
                return responseData
            }
            const confirmationData = {
                "scbFee": responseData.data.scbFee,
                "accountTo": responseData.data.accountTo,
                "accountFromName": responseData.data.accountFromName,
                "amount": amount,
                "accountToName": responseData.data.accountToName,
                "botFee": responseData.data.botFee,
                "pccTraceNo": responseData.data.pccTraceNo,
                "fee": responseData.data.totalFee,
                "channelFee": responseData.data.channelFee,
                "terminalNo": responseData.data.terminalNo,
                "sequence": responseData.data.sequence,
                "feeType": responseData.data.feeType,
                "accountFromType": 2,
                "transactionToken": responseData.data.transactionToken,
                "transferType": transfer_type,
                "accountToBankCode": responseData.data.accountToBankCode,
                "accountFrom": accountNo.accountNo
            };
            const confirmationUrl = "https://fasteasy.scbeasy.com/v3/transfer/confirmation";
            resp = await axios.post(confirmationUrl, confirmationData, { headers });
            return resp.data;
        } catch (error) {
            console.error("Error:", error.message);
            throw error;
        }
    }
    

    async TransferVerification(accno, bankcode, amount) {
        try {
            const accountNo = await this.getAccounts();
            if (!accno || !bankcode || !amount) {
                throw new Error("Please provide complete information");
            }
            const transfer_type = (bankcode === "014") ? "3RD" : "ORFT";
            const headers = {
                'Accept-Language': 'th',
                'scb-channel': 'app',
                'User-Agent': this.useragent,
                'Host': 'fasteasy.scbeasy.com:8443',
                'Connection': 'Keep-Alive',
                'Accept-Encoding': 'gzip',
                'Api-Auth': accountNo.Auth,
                'Content-Type': 'application/json; charset=UTF-8'
            };
            const data = {
                "accountFromType": 2,
                "amount": amount,
                "annotation": null,
                "transferType": transfer_type,
                "accountToBankCode": bankcode,
                "accountFrom": accountNo.accountNo,
                "accountTo": accno
            };
            const url = "https://fasteasy.scbeasy.com/v2/transfer/verification";
            const resp = await axios.post(url, data, { headers });
            const result = resp.data;
            const check = result.status.code;
            if (check !== 1000) {
                return resp.data;
            }
            return resp.data;
        } catch (error) {
            console.error("Error:", error.message);
            throw error;
        }
    }

    
    async TopupTruewallet(mobileNo, amount) {
        try {
            const accountNo = await this.getAccounts();
            const headers = {
                'Accept-Language': 'th',
                'scb-channel': 'app',
                'User-Agent': this.useragent,
                'Host': 'fasteasy.scbeasy.com:8443',
                'Connection': 'Keep-Alive',
                'Accept-Encoding': 'gzip',
                'Api-Auth': accountNo.Auth,
                'Content-Type': 'application/json; charset=UTF-8'
            };
            const billersUrl = "https://fasteasy.scbeasy.com/v1/topup/billers";
            const billersResp = await axios.get(billersUrl, { headers });
            const billersData = billersResp.data;
            let id = "";
            billersData.data.forEach(v => {
                if (v.id === "8") {
                    id = v.id;
                }
            });
            const additionalInfoUrl = `https://fasteasy.scbeasy.com/v2/topup/billers/${id}/additionalinfo`;
            const additionalInfoData = {
                "pmtAmt": amount,
                "billerId": id,
                "depAcctIdFrom": accountNo.accountNo,
                "serviceNumber": mobileNo,
                "note": "TOPUP"
            };
            const additionalInfoResp = await axios.post(additionalInfoUrl, additionalInfoData, { headers });
            const additionalInfoResult = additionalInfoResp.data;
            if (additionalInfoResult.status.code !== 1000) {
                return additionalInfoResult.status.description;
            } else {
                const transactionToken = additionalInfoResult.data.transactionToken;
                const topupUrl = "https://fasteasy.scbeasy.com/v2/topup";
                const topupData = {
                    "depAcctIdFrom": accountNo.accountNo,
                    "billRef2": "",
                    "billRef3": "",
                    "misc2": "",
                    "misc1": "",
                    "feeAmt": "0.0",
                    "note": "TOPUP",
                    "serviceNumber": mobileNo,
                    "transactionToken": transactionToken,
                    "pmtAmt": amount,
                    "mobileNumber": mobileNo,
                    "billerId": id,
                    "billRef1": mobileNo
                };
                const topupResp = await axios.post(topupUrl, topupData, { headers });
                return topupResp.data;
            }
        } catch (error) {
            console.error("Error:", error.message);
            throw error;
        }
    }

    
    async getMerchantTransaction(walletId, start = null, end = null, page = 1, limit = 50) {
        try {
            const Auth = await this.getCacheLogin();
            if (!walletId) {
                throw new Error("ไม่ได้กรอกหมายเลขกระเป๋าร้านค้า");
            }
            if (!start) {
                start = new Date().getFullYear() + "-01-01";
            } else {
                start = new Date(start).toISOString().split('T')[0];
            }
            if (!end) {
                end = new Date().toISOString().split('T')[0];
            } else {
                end = new Date(end).toISOString().split('T')[0];
            }
            const headers = {
                'Accept-Language': 'th',
                'scb-channel': 'app',
                'User-Agent': this.useragent,
                'Host': 'fasteasy.scbeasy.com:8443',
                'Connection': 'Keep-Alive',
                'Accept-Encoding': 'gzip',
                'Api-Auth': Auth,
                'Content-Type': 'application/json; charset=UTF-8'
            };
            const data = {
                "walletList": [
                    {
                        "startDate": start,
                        "endDate": end,
                        "pageSize": limit,
                        "pageNumber": page,
                        "walletId": walletId
                    }
                ]
            };
            const url = "https://fasteasy.scbeasy.com/v1/merchants/transactions";
            const resp = await axios.post(url, data, { headers });
            return resp.data;
        } catch (error) {
            console.error("Error:", error.message);
            throw error;
        }
    }

    
    async getCardlessMoney(amount) {
        try {
            const accountNo = await this.getAccounts();
            if (!amount) {
                throw new Error("กรุณากรอกจำนวนเงินในการกดเงินไม่ใช้บัตร");
            }
            const headers = {
                'Accept-Language': 'th',
                'scb-channel': 'app',
                'User-Agent': this.useragent,
                'Host': 'fasteasy.scbeasy.com:8443',
                'Connection': 'Keep-Alive',
                'Accept-Encoding': 'gzip',
                'Api-Auth': accountNo['Auth'],
                'Content-Type': 'application/json; charset=UTF-8'
            };
            const data = {};
            const url = "https://fasteasy.scbeasy.com/v1/cardlessatm/info";
            let resp = await axios.post(url, data, { headers });
            resp = resp.data;
    
            if (resp["status"]["code"] == "1000") {
                const useremain = resp["data"]["casa"]["remainingDailyCountLimit"];
                const moneyremain = resp["data"]["casa"]["remainingDailyAmountLimit"];
                const min = resp["data"]["casa"]["minAmount"];
                const max = resp["data"]["casa"]["maxAmount"];
                const amountInt = parseInt(amount);
                if (useremain >= 1) {
                    if (amountInt <= moneyremain) {
                        if (amountInt % 100 === 0) {
                            if (amountInt >= min && amountInt <= max) {
                                const verificationData = {
                                    "paymentType": "CCW_CASA",
                                    "sourceOfFundNo": accountNo['accountNo'],
                                    "tileVersion": this.tilesVersion,
                                    "amount": amountInt
                                };
                                const verificationUrl = "https://fasteasy.scbeasy.com/v3/cardlessatm/verification";
                                let verificationResp = await axios.post(verificationUrl, verificationData, { headers });
                                verificationResp = verificationResp.data;
                                if (verificationResp["status"]["code"] == "1000") {
                                    const confirmationData = {
                                        "transactionToken": verificationResp["data"]["transactionToken"],
                                        "maskedMobileNo": verificationResp["data"]["mobileNoList"][0]["maskedMobileNo"],
                                        "paymentType": "CCW_CASA",
                                        "mobileNoReference": verificationResp["data"]["mobileNoList"][0]["mobileNoReference"]
                                    };
                                    const confirmationUrl = "https://fasteasy.scbeasy.com/v2/cardlessatm/confirmation";
                                    let confirmationResp = await axios.post(confirmationUrl, confirmationData, { headers });
                                    return confirmationResp.data;
                                } else {
                                    return verificationResp;
                                }
                            } else {
                                throw new Error("กรุณากรอกจำนวนระหว่าง " + min + " - " + max);
                            }
                        } else {
                            throw new Error("กรุณากรอกเป็นจำนวนที่ 100 หารลงตัว");
                        }
                    } else {
                        throw new Error("วันนี้ใช้ยอดเงินครบจำนวนในการกดเงินไม่ใช้บัตรแล้ว");
                    }
                } else {
                    throw new Error("วันนี้ใช้งานครบจำนวนในการกดเงินไม่ใช้บัตรแล้ว");
                }
            } else {
                return resp;
            }
        } catch (error) {
            console.error("Error:", error.message);
            throw error;
        }
    }
    

    async TransferBypassLimit(accountTo, BankCode, amount) {
        try {
            const accountNo = await this.getAccounts();
            const groupIdResponse = await this.createGroupTransfer(accountNo['Auth']);
            const groupId = groupIdResponse;
            const createGroupAccountResponse = await this.createGroupAccount(accountNo['Auth'], groupId['data']['groupId'], accountTo, BankCode, amount);
            const createGroupAccount = createGroupAccountResponse
            if (createGroupAccount['status']['code'] !== 1000) {
                await this.deleteGroupTransfer(accountNo['Auth'], groupId['data']['groupId']);
                return createGroupAccount['status']
            }
            const recipientListResponse = await this.getGroupAccount(accountNo['Auth'], groupId['data']['groupId']);
            const recipientList = recipientListResponse
            const txResponse = await this.TransferGroupCcreate(accountNo['Auth'], accountNo['accountNo'], groupId['data']['groupId'], recipientList['data']['recipientList']);
            const tx = txResponse
            if (tx['status']['code'] !== 1000) {
                await this.deleteGroupTransfer(accountNo['Auth'], groupId['data']['groupId']);
                return tx['status'];
            }
            const confirmResponse = await this.TransferGroupConfirm(accountNo['Auth'], tx['data']['transactionToken']);
            await this.deleteGroupTransfer(accountNo['Auth'], groupId['data']['groupId']);
            return confirmResponse;

        } catch (error) {
            console.error("Error:", error.message);
            throw error;
        }
    }



    async createGroupTransfer(Auth) {
        try {
            const formattedDate = new Date().toISOString().split('.')[0];
            const header = {
                'Accept-Language': 'th',
                'scb-channel': 'app',
                'User-Agent': this.useragent,
                'Host': 'fasteasy.scbeasy.com:8443',
                'Connection': 'Keep-Alive',
                'Accept-Encoding': 'gzip',
                'Api-Auth': Auth,
                'Content-Type': 'application/json; charset=UTF-8'
            };
            const data = {
                'groupName': formattedDate
            };
            const url = "https://fasteasy.scbeasy.com/v1/bulktransferprofiles/group";
            const resp = await this.Curl("POST", url, data, header);
            return resp;
        } catch (error) {
            console.error("Error:", error.message);
            throw error;
        }
    }
    


    async createGroupAccount(Auth, groupId, accountTo, BankCode, amount) {
        try {
            const header = {
                'Accept-Language': 'th',
                'scb-channel': 'app',
                'User-Agent': this.useragent,
                'Host': 'fasteasy.scbeasy.com:8443',
                'Connection': 'Keep-Alive',
                'Accept-Encoding': 'gzip',
                'Api-Auth': Auth,
                'Content-Type': 'application/json; charset=UTF-8'
            };
            const data = {
                "groupId": groupId,
                "recipientList": [
                    {
                        'nickname': accountTo,
                        'amount': amount,
                        'accountTo': accountTo,
                        'bankCode': BankCode,
                        'subFunction': BankCode === "014" ? "SCB" : "OTHER"
                    }
                ]
            };
            const url = "https://fasteasy.scbeasy.com/v1/bulktransferprofiles/group/recipient";
            const resp = await this.Curl("POST", url, data, header);
            return resp;
        } catch (error) {
            console.error("Error:", error.message);
            throw error;
        }
    }
    
    

    async getGroupAccount(Auth, groupId) {
        try {
            const header = {
                'Accept-Language': 'th',
                'scb-channel': 'app',
                'User-Agent': this.useragent,
                'Host': 'fasteasy.scbeasy.com:8443',
                'Connection': 'Keep-Alive',
                'Accept-Encoding': 'gzip',
                'Api-Auth': Auth,
                'Content-Type': 'application/json; charset=UTF-8'
            };
            const data = {};
            const url = `https://fasteasy.scbeasy.com/v1/bulktransferprofiles/group/recipient?groupId=${groupId}`;
            const resp = await this.Curl("GET", url, data, header);
            return resp;
        } catch (error) {
            console.error("Error:", error.message);
            throw error;
        }
    }
    
    async getGroupAccountAll() {
        try {
            const accountNo = await this.getAccounts();
            const header = {
                'Accept-Language': 'th',
                'scb-channel': 'app',
                'User-Agent': this.useragent,
                'Host': 'fasteasy.scbeasy.com:8443',
                'Connection': 'Keep-Alive',
                'Accept-Encoding': 'gzip',
                'Api-Auth': accountNo.Auth,
                'Content-Type': 'application/json; charset=UTF-8'
            };
            const data = {};
            const url = "https://fasteasy.scbeasy.com/v1/bulktransferprofiles/group";
            const resp = await this.Curl("GET", url, data, header);
            return resp;
        } catch (error) {
            console.error("Error:", error.message);
            throw error;
        }
    }
    

    async TransferGroupCcreate(Auth, accountFrom, groupId, recipientList = []) {
        try {
            const header = {
                'Accept-Language': 'th',
                'scb-channel': 'app',
                'User-Agent': this.useragent,
                'Host': 'fasteasy.scbeasy.com:8443',
                'Connection': 'Keep-Alive',
                'Accept-Encoding': 'gzip',
                'Api-Auth': Auth,
                'Content-Type': 'application/json; charset=UTF-8'
            };
            const data = {
                ...recipientList,
                accountFrom,
                groupId
            };
            const url = "https://fasteasy.scbeasy.com/v1/transfer/bulk/verification";
            const resp = await this.Curl("POST", url, data, header);
            return resp;
        } catch (error) {
            console.error("Error:", error.message);
            throw error;
        }
    }
    

    async TransferGroupConfirm(Auth, transactionToken) {
        try {
            const header = {
                'Accept-Language': 'th',
                'scb-channel': 'app',
                'User-Agent': this.useragent,
                'Host': 'fasteasy.scbeasy.com:8443',
                'Connection': 'Keep-Alive',
                'Accept-Encoding': 'gzip',
                'Api-Auth': Auth,
                'Content-Type': 'application/json; charset=UTF-8'
            };
            const data = {
                "transactionToken": transactionToken
            }
            const url = "https://fasteasy.scbeasy.com/v1/transfer/bulk/confirmation";
            const resp = await this.Curl("POST", url, data, header);
            return resp;
        } catch (error) {
            console.error("Error:", error.message);
            throw error;
        }
    }


    async deleteGroupTransfer(Auth, groupId) {
        try {
            const header = {
                'Accept-Language': 'th',
                'scb-channel': 'app',
                'User-Agent': this.useragent,
                'Host': 'fasteasy.scbeasy.com:8443',
                'Connection': 'Keep-Alive',
                'Accept-Encoding': 'gzip',
                'Api-Auth': Auth,
                'Content-Type': 'application/json; charset=UTF-8'
            };
            const data ={
                "groupId": groupId
            }
            const url = "https://fasteasy.scbeasy.com/v1/bulktransferprofiles/group";
            const resp = await this.Curl("DELETE", url, data, header);
            return resp;
        } catch (error) {
            console.error("Error:", error.message);
            throw error;
        }
    }
    

    async deleteGroupTransferId(groupId) {
        try {
            const accountNo = await this.getAccounts();
            const header = {
                'Accept-Language': 'th',
                'scb-channel': 'app',
                'User-Agent': this.useragent,
                'Host': 'fasteasy.scbeasy.com:8443',
                'Connection': 'Keep-Alive',
                'Accept-Encoding': 'gzip',
                'Api-Auth': accountNo['Auth'],
                'Content-Type': 'application/json; charset=UTF-8'
            };
            const data ={
                "groupId": groupId
            }
            const url = "https://fasteasy.scbeasy.com/v1/bulktransferprofiles/group";
            const resp = await this.Curl("DELETE", url, data, header);
            return resp;
        } catch (error) {
            console.error("Error:", error.message);
            throw error;
        }
    }
    

     getImagePath(data = null) {
        if (!data) {
            return data;
        } else {
            return `https://fasteasy.scbeasy.com/portalserver/content/bbp/repositories/contentRepository?path=${data}`;
        }
    }
    

    async Curl(method, url, data, header = [], check_header = false) {
        try {
            const response = await axios({
                method: method,
                url: url,
                headers: header,
                data: data
            });
    
            return response.data;
        } catch (error) {
            throw new Error(error.message);
        }
    }
    
    
}



module.exports = SCBEASY;
