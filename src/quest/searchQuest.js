class SearchQuest {
    constructor(googleTrend) {
        this._googleTrend_ = googleTrend;
        this._searchIntervalMS = 2000
        this.reset();
    }

    reset() {
        this._status_ = null;
        this._pcSearchWordIdx_ = 0;
        this._mbSearchWordIdx_ = 0;
        this._currentSearchCount_ = 0;
        this._currentSearchType_ = null;
        this._jobStatus_ = STATUS_NONE;
    }

    get jobStatus() {
        return this._jobStatus_;
    }

    async doWork(status) {
        console.assert(status != null);

        this._status_ = status;
        this._jobStatus_ = STATUS_BUSY;
        try {
            await getUA();
            await this._googleTrend_.getGoogleTrendWords();
            await this._doWorkLoop();
        } catch (ex) {
            this._jobStatus_ = STATUS_ERROR;
            if (ex instanceof UserAgentInvalidException) {
                notifyUpdatedUAOutdated();
            }
            throw ex;
        }
    }

    async _doWorkLoop() {
        while (true) {
            if (this._status_.isSearchCompleted) {
                return;
            }

            if (this._status_.jobStatus == STATUS_ERROR || !this._status_.summary.isValid) {
                this._jobStatus_ = STATUS_ERROR;
                return;
            }

            await this._startSearchQuests();

            const flag = await this.isSearchSuccessful();
            if (flag > 0) {
                await this._getAlternativeUA(flag);
            }
        }
    }

    async _startSearchQuests() {
        await this._doPcSearch();
        await this._doMbSearch();
        this._quitSearchCleanUp();
    }

    async isSearchSuccessful() {
        // Return:
        // 0 - successful; 1 - pc search failed; 2 - mb search failed; 3 - both failed
        const pcSearchProgBefore = this._status_.pcSearchStatus.progress;
        const mbSearchProgBefore = this._status_.mbSearchStatus.progress;
        await this._status_.update();
        const flag = (!this._status_.pcSearchStatus.isValidAndCompleted && (pcSearchProgBefore == this._status_.pcSearchStatus.progress));
        return flag + 2 * (!this._status_.mbSearchStatus.isValidAndCompleted && (mbSearchProgBefore == this._status_.mbSearchStatus.progress));
    }

    async _getAlternativeUA(flag) {
        if (flag == 3) {
            if (userAgents.pcSource == 'updated' && userAgents.mbSource == 'updated') {
                throw new UserAgentInvalidException('Cannot find working UAs for pc and mobile.');
            }
            await getUpdatedUA('both');
        } else if (flag == 1) {
            if (userAgents.pcSource == 'updated') {
                throw new UserAgentInvalidException('Cannot find a working UA for pc.');
            }
            await getUpdatedUA('pc');
        } else if (flag == 2) {
            if (userAgents.mbSource == 'updated') {
                throw new UserAgentInvalidException('Cannot find a working UA for mobile.');
            }
            await getUpdatedUA('mb');
        }
        notifyStableUAOutdated(flag);
    }

    async _doPcSearch() {
        this._initiateSearch();
        if (this._currentSearchType_ != SEARCH_TYPE_PC_SEARCH) {
            this._preparePCSearch();
        }

        await this._requestBingSearch();
    }

    async _doMbSearch() {
        this._initiateSearch();
        if (this._currentSearchType_ != SEARCH_TYPE_MB_SEARCH) {
            this._prepareMbSearch();
        }

        await this._requestBingSearch();
    }

    _initiateSearch() {
        this._currentSearchCount_ = 0;
    }

    _preparePCSearch() {
        this._currentSearchType_ = SEARCH_TYPE_PC_SEARCH;
        removeUA();
        setPCReqHeaders();
    }

    _prepareMbSearch() {
        this._currentSearchType_ = SEARCH_TYPE_MB_SEARCH;
        removeUA();
        setMobileReqHeaders();
    }

    _quitSearchCleanUp() {
        if (this._jobStatus_ == STATUS_BUSY) {
            this._jobStatus_ = STATUS_DONE;
        }
        this._currentSearchType_ = null;
        removeUA();
    }

    async _requestBingSearch() {
        if (this._isCurrentSearchCompleted()) {
            return;
        }
        let response;
        try {
            response = await fetch(this._getBingSearchUrl());
        } catch (ex) {
            throw new FetchFailedException('Search', ex);
        }
    
        if (response.status != 200) {
            throw new FetchResponseAnomalyException('Search');
        }
    
        this._currentSearchCount_++;
        const minInterval = 6000;
        const maxInterval = 15000;
        let sleeptime = Math.floor(Math.random() * (maxInterval - minInterval + 1)) + minInterval
        console.log(`Sleeping for: ${Math.round(sleeptime/1000,2)} sec`)
        await sleep(sleeptime);
        console.log(`Search complete`);
    
        await this._requestBingSearch();
    }

    _getBingSearchUrl() {
        let word = this._currentSearchType_ == SEARCH_TYPE_PC_SEARCH ?
            this._googleTrend_.nextPCWord :
            this._googleTrend_.nextMBWord;
            word = word.replace(/ /g, '_');
    
        let combination = '';
        let refigcombination = '';
        let numbers = new Uint8Array(16);
        crypto.getRandomValues(numbers);
        combination = numbers.toString().split(",").map((e)=>{return parseInt(e).toString(16)}).join("").toUpperCase()
        refigcombination = numbers.toString().split(",").map((e)=>{return parseInt(e).toString(16)}).join("")
    
        const randomChoice = arr => arr[Math.floor(Math.random() * arr.length)];
        const randomInclude = () => Math.random() < 0.7; // 70% chance to include each parameter
    
        let url = `https://www.bing.com/search?q=${word}`;
    
        // form parameter is always included as it's needed for the searches to count
        url += `&form=${randomChoice(['QBLH', 'QBRE', 'QSRE', 'CONMHP', 'ANAB01', 'SBIES', 'GESBIES', 'HPBSBI', 'HPBSB', 'HDRSC2', 'PRUSEN', 'ENTLNK', 'MSNSEA', 'MSNLIF', 'MSNINT', 'MSNHPH', 'MSNHPS', 'EDGSPH', 'EDGGTC', 'EDGSI', 'EDGDCT', 'EDGLIS', 'EDGNSP', 'EDGSNS'])}`;
    
        if (randomInclude()) url += `&refig=${refigcombination}`;
        if (randomInclude()) url += `&pq=${word}`;
        if (randomInclude()) url += `&qs=${randomChoice(['n', 'SSE', 'n', 'SS', 'n'])}`;
        if (randomInclude()) url += `&sp=${randomChoice(['-1', '0', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10'])}`;
        if (randomInclude()) url += `&ghc=${randomChoice(['0', '1'])}`;
        if (randomInclude()) url += `&lq=${randomChoice(['0', '1'])}`;
        if (randomInclude()) url += `&sc=${randomChoice([10, 11, 16, 7, 19])}-${word.length}`;
        if (randomInclude()) url += `&cvid=${combination}`;
        if (randomInclude()) url += randomChoice(['&ghsh=0&ghacc=0&', '&ghsh=1&ghacc=1&ghpl=', '&ghsh=0&ghacc=1&', '&ghsh=1&ghacc=0&ghpl=']);
    
        console.log(url)
        return url;
    }

    _isCurrentSearchCompleted() {
        return this._currentSearchType_ == SEARCH_TYPE_PC_SEARCH ?
            this._currentSearchCount_ >= this._status_.pcSearchStatus.searchNeededCount :
            this._currentSearchCount_ >= this._status_.mbSearchStatus.searchNeededCount;
    }
}

function removeUA() {
    try {
        chrome.webRequest.onBeforeSendHeaders.removeListener(toMobileReqHeaders);
    } catch (ex) { }
    try {
        chrome.webRequest.onBeforeSendHeaders.removeListener(toPCReqHeaders);
    } catch (ex) { }
}

function setPCReqHeaders() {
    chrome.webRequest.onBeforeSendHeaders.addListener(toPCReqHeaders, {
        urls: ['https://*.bing.com/search?q=*'],
    }, ['blocking', 'requestHeaders']);
}

function toPCReqHeaders() {
    const newHeaders = [];
    newHeaders.push({name: 'accept', value: '*/*'});
    newHeaders.push({name: 'User-Agent', value: userAgents.pc});
    return {
        requestHeaders: newHeaders,
    };
}

function setMobileReqHeaders() {
    chrome.webRequest.onBeforeSendHeaders.addListener(toMobileReqHeaders, {
        urls: ['https://*.bing.com/search?q=*'],
    }, ['blocking', 'requestHeaders']);
}

function toMobileReqHeaders() {
    const newHeaders = [];
    newHeaders.push({name: 'accept', value: '*/*'});
    newHeaders.push({name: 'User-Agent', value: userAgents.mb});
    return {
        requestHeaders: newHeaders,
    };
}


function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function notifyStableUAOutdated(flag) {
    if (developer && developer.notification_ua_stable_outdated) {
        const message = 'Stable UA is outdated! Flag: ' + (flag == 3 ? 'pc and mobile' : flag == 1 ? 'pc' : 'mobile');
        console.log(message);
        chrome.notifications.clear('stable_ua_outdated');
        chrome.notifications.create('stable_ua_outdated', {
            type: 'basic',
            iconUrl: 'img/warn@8x.png',
            title: 'Developer notification',
            message: message,
            priority: 2,
        });
    }
}

function notifyUpdatedUAOutdated() {
    if (developer && developer.notification_ua_updated_outdated) {
        const message = 'Critical!! Updated UA is outdated!';
        console.log(message);
        chrome.notifications.clear('updated_ua_outdated');
        chrome.notifications.create('updated_ua_outdated', {
            type: 'basic',
            iconUrl: 'img/err@8x.png',
            title: 'Developer notification',
            message: message,
            priority: 2,
        });
    }
}

const SEARCH_TYPE_PC_SEARCH = 0;
const SEARCH_TYPE_MB_SEARCH = 1;
const STATUS_NONE = 0;
const STATUS_BUSY = 1;
const STATUS_DONE = 20;
const STATUS_WARNING = 30;
const STATUS_ERROR = 3;
