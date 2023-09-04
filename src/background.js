'use strict';

import {isNewDay, getDebugInfo} from './utility.js';
import {setBadge, isCurrentBadge, GreyBadge, BusyBadge, DoneBadge, ErrorBadge} from './badge.js';
import {handleException} from './exception.js';
import {GoogleTrend} from './GoogleTrend.js';
import {DailyRewardStatus} from './status/dailyRewardStatus.js';
import {checkQuizAndDaily} from './quest/quizDailyQuest.js';
import {SearchQuest} from './quest/searchQuest.js';
import {STATUS_BUSY} from '../constants.js';

function onExtensionLoad() {
    setBadge(new GreyBadge());
    loadSavedSettings();
    getDeveloperSettings();
    setDelayedInitialisation(5000);
}

function loadSavedSettings() {
    chrome.storage.sync.get({
        compatibilityMode: false,
        pcUaOverrideEnable: false,
        mbUaOverrideEnable: false,
        pcUaOverrideValue: '',
        mbUaOverrideValue: '',
    }, function (options) {
        _compatibilityMode = options.compatibilityMode;
        _pcUaOverrideEnable = options.pcUaOverrideEnable;
        _mbUaOverrideEnable = options.mbUaOverrideEnable;
        _pcUaOverrideValue = options.pcUaOverrideValue;
        _mbUaOverrideValue = options.mbUaOverrideValue;
    });
}

async function getDeveloperSettings() {
    const devJson = chrome.runtime.getURL('developer.json');
    const fetchProm = await fetch(devJson, {method: 'GET'}).then((response) => {
        return response.json();
    }).then((json) => {
        developer = json;
        console.log('Developer mode enabled.');
        console.log(developer);
    }).catch((ex) => {
        if (ex.name == 'TypeError') {
            return;
        }
        throw ex;
    });
}

// -----------------------------
// Work
// -----------------------------
function setDelayedInitialisation(ms) {
    setTimeout(
        function () {
            initialize();
        },
        ms,
    );
}

function initialize() {
    doBackgroundWork();

    // check every 120 minutes for possible new promotion
    setInterval(
        function () {
            doBackgroundWork();
        },
        WORKER_ACTIVATION_INTERVAL,
    );
}

async function doBackgroundWork() {
    if (searchQuest.jobStatus == STATUS_BUSY || userDailyStatus.jobStatus == STATUS_BUSY) {
        return;
    }

    await waitTillOnline();

    setBadge(new BusyBadge());

    if (isNewDay()) {
        searchQuest.reset();
        googleTrend.reset();
    }
    
    await checkDailyRewardStatus();

    if (isCurrentBadge('busy')) {
        setBadge(new DoneBadge());
    }
}

async function waitTillOnline() {
    while (!navigator.onLine) {
        await setTimeoutAsync(WAIT_FOR_ONLINE_TIMEOUT);
    }
}

async function setTimeoutAsync(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function checkDailyRewardStatus() {
    // update status
    let result;
    try {
        result = await userDailyStatus.update();
    } catch (ex) {
        handleException(ex);
    }
    if (!result || !userDailyStatus.summary.isValid) {
        setBadge(new ErrorBadge());
        return;
    }

    await doSearchQuests();

    checkQuizAndDaily();
}

async function doSearchQuests() {
    if (userDailyStatus.summary.isCompleted) {
        return;
    }

    if (!userDailyStatus.pcSearchStatus.isCompleted || !userDailyStatus.mbSearchStatus.isCompleted) {
        try {
            await searchQuest.doWork(userDailyStatus);
        } catch (ex) {
            handleException(ex);
        }
    }
}

const WORKER_ACTIVATION_INTERVAL = 7200000; // Interval at which automatic background works are carried out, in ms.
const WAIT_FOR_ONLINE_TIMEOUT = 60000;

const googleTrend = new GoogleTrend();
export const userDailyStatus = new DailyRewardStatus();
const searchQuest = new SearchQuest(googleTrend);
export let developer = false;
export let userAgents;
export let _compatibilityMode;
export let _pcUaOverrideEnable;
export let _mbUaOverrideEnable;
export let _pcUaOverrideValue;
export let _mbUaOverrideValue;

chrome.runtime.onInstalled.addListener(function (details) {
    if (details.reason == 'install') {

    }
    if (details.reason == 'update') {

    }
});

chrome.runtime.onMessage.addListener(function (request) {
    if (request.action == 'checkStatus') {
        doBackgroundWork();
    }
    if (request.action == 'updateOptions') {
        _compatibilityMode = request.content.compatibilityMode;
        _pcUaOverrideEnable = request.content.pcUaOverrideEnable;
        _mbUaOverrideEnable = request.content.mbUaOverrideEnable;
        _pcUaOverrideValue = request.content.pcUaOverrideValue;
        _mbUaOverrideValue = request.content.mbUaOverrideValue;
        return;
    }
    if (request.action == 'copyDebugInfo') {
        getDebugInfo();
    }
});

onExtensionLoad();
