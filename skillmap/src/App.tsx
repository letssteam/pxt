/// <reference path="./lib/skillMap.d.ts" />

import React from 'react';
import { connect } from 'react-redux';

import store from "./store/store";
import * as authClient from "./lib/authClient";
import { getCompletedBadges, getFlattenedHeaderIds, hasUrlBeenStarted } from "./lib/skillMapUtils";

import {
    dispatchAddSkillMap,
    dispatchClearSkillMaps,
    dispatchClearMetadata,
    dispatchSetPageTitle,
    dispatchSetPageDescription,
    dispatchSetPageInfoUrl,
    dispatchSetUser,
    dispatchSetPageSourceUrl,
    dispatchSetPageAlternateUrls,
    dispatchSetPageBackgroundImageUrl,
    dispatchSetPageBannerImageUrl,
    dispatchSetPageTheme,
    dispatchSetUserPreferences
} from './actions/dispatch';
import { PageSourceStatus, SkillMapState } from './store/reducer';
import { HeaderBar } from './components/HeaderBar';
import { AppModal } from './components/AppModal';
import { SkillGraphContainer } from './components/SkillGraphContainer';
import { InfoPanel } from './components/InfoPanel';

import { parseSkillMap } from './lib/skillMapParser';
import { parseHash, getMarkdownAsync, MarkdownSource, parseQuery,
    setPageTitle, setPageSourceUrl, ParsedHash } from './lib/browserUtils';

import { MakeCodeFrame } from './components/makecodeFrame';
import { getLocalUserStateAsync, getUserStateAsync, saveUserStateAsync } from './lib/workspaceProvider';
import { Unsubscribe } from 'redux';
import { UserProfile } from './components/UserProfile';
import { ReadyResources, ReadyPromise } from './lib/readyResources';

/* eslint-disable import/no-unassigned-import */
import './App.css';

// TODO: this file needs to read colors from the target
import './arcade.css';

/* eslint-enable import/no-unassigned-import */
interface AppProps {
    skillMaps: { [key: string]: SkillMap };
    activityOpen: boolean;
    backgroundImageUrl: string;
    theme: SkillGraphTheme;
    signedIn: boolean;
    dispatchAddSkillMap: (map: SkillMap) => void;
    dispatchClearSkillMaps: () => void;
    dispatchClearMetadata: () => void;
    dispatchSetPageTitle: (title: string) => void;
    dispatchSetPageDescription: (description: string) => void;
    dispatchSetPageInfoUrl: (infoUrl: string) => void;
    dispatchSetPageBackgroundImageUrl: (backgroundImageUrl: string) => void;
    dispatchSetPageBannerImageUrl: (bannerImageUrl: string) => void;
    dispatchSetUser: (user: UserState) => void;
    dispatchSetPageSourceUrl: (url: string, status: PageSourceStatus) => void;
    dispatchSetPageAlternateUrls: (urls: string[]) => void;
    dispatchSetPageTheme: (theme: SkillGraphTheme) => void;
    dispatchSetUserPreferences: (prefs: pxt.auth.UserPreferences) => void;
}

interface AppState {
    error?: string;
    cloudSyncCheckHasFinished: boolean;
    badgeSyncLock: boolean;
}

class AppImpl extends React.Component<AppProps, AppState> {
    protected queryFlags: {[index: string]: string} = {};
    protected unsubscribeChangeListener: Unsubscribe | undefined;
    protected loadedUser: UserState | undefined;
    protected readyPromise: ReadyPromise;

    constructor(props: any) {
        super(props);
        this.state = {
            cloudSyncCheckHasFinished: false,
            badgeSyncLock: false
        };
        this.readyPromise = new ReadyPromise();

        window.addEventListener("hashchange", this.handleHashChange);
        this.cloudSyncCheckAsync();
    }

    protected ready = (): Promise<ReadyResources> => this.readyPromise.promise();

    protected handleHashChange = async (e: HashChangeEvent) => {
        await this.parseHashAsync();
        e.stopPropagation();
        e.preventDefault();
    }

    protected async parseHashAsync() {
        let config = await pxt.targetConfigAsync();
        let hash: ParsedHash;

        const possibleAlias = window.location.hash.replace("#", "");

        if (possibleAlias && config.skillMap?.pathAliases?.[possibleAlias]) {
            hash = parseHash(config.skillMap.pathAliases[possibleAlias]);
        }
        else {
            hash = parseHash(window.location.hash || config.skillMap?.defaultPath);
        }

        await this.fetchAndParseSkillMaps(hash.cmd as MarkdownSource, hash.arg);
    }

    protected handleError = (msg?: string) => {
        const errorMsg = msg || lf("Oops! Couldn't load content, please check the URL and markdown file.");
        console.error(errorMsg);
        this.setState({ error: errorMsg });
    }

    protected async initLocalizationAsync() {
        const theme = pxt.appTarget.appTheme;

        const href = window.location.href;
        let force = false;
        let useLang: string | undefined = undefined;
        if (/[&?]translate=1/.test(href) && !pxt.BrowserUtils.isIE()) {
            useLang = ts.pxtc.Util.TRANSLATION_LOCALE;
        } else {
            const mlang = /(live)?(force)?lang=([a-z]{2,}(-[A-Z]+)?)/i.exec(window.location.href);
            if (mlang && window.location.hash.indexOf(mlang[0]) >= 0) {
                pxt.BrowserUtils.changeHash(window.location.hash.replace(mlang[0], ""));
            }
            useLang = mlang ? mlang[3] : (pxt.BrowserUtils.getCookieLang() || theme.defaultLocale || (navigator as any).userLanguage || navigator.language);
            force = !!mlang && !!mlang[2];
        }

        // TODO: include the pxt webconfig so that we can get the commitcdnurl (and not always pass live=true)
        const baseUrl = "";
        const targetId = pxt.appTarget.id;
        const pxtBranch = pxt.appTarget.versions.pxtCrowdinBranch;
        const targetBranch = pxt.appTarget.versions.targetCrowdinBranch;

        const defLocale = pxt.appTarget.appTheme.defaultLocale;
        const langLowerCase = useLang?.toLocaleLowerCase();
        const localDevServe = pxt.BrowserUtils.isLocalHostDev()
            && (!langLowerCase || (defLocale
                ? defLocale.toLocaleLowerCase() === langLowerCase
                : "en" === langLowerCase || "en-us" === langLowerCase));
        const serveLocal = pxt.BrowserUtils.isPxtElectron() || localDevServe;
        if (!serveLocal) {
            pxt.Util.enableLiveLocalizationUpdates();
        }

        await updateLocalizationAsync({
            targetId: targetId,
            baseUrl: baseUrl,
            code: useLang!,
            pxtBranch: pxtBranch!,
            targetBranch: targetBranch!,
            force: force,
        });

        if (pxt.Util.isLocaleEnabled(useLang!)) {
            pxt.BrowserUtils.setCookieLang(useLang!);
        }
    }

    protected async fetchAndParseSkillMaps(source: MarkdownSource, url: string) {
        const result = await getMarkdownAsync(source, url);

        const md = result?.text;
        const fetched = result?.identifier;
        const status = result?.status;

        let loadedMaps: SkillMap[] | undefined;

        if (md && fetched && status) {
            try {
                if (status === "banned") {
                    this.handleError(lf("This GitHub repository has been banned."));
                } else {
                    setPageSourceUrl(fetched);
                    this.props.dispatchSetPageSourceUrl(fetched, status);
                    this.props.dispatchClearMetadata();
                }

                const { maps, metadata } = parseSkillMap(md);
                if (maps?.length > 0) {
                    loadedMaps = maps;
                    this.props.dispatchClearSkillMaps();
                    maps.forEach(map => {
                        this.props.dispatchAddSkillMap(map);
                    })
                }

                if (metadata) {
                    const { title, description, infoUrl, backgroundImageUrl,
                        bannerImageUrl, theme, alternateSources } = metadata;
                    setPageTitle(title);
                    this.props.dispatchSetPageTitle(title);
                    if (description) this.props.dispatchSetPageDescription(description);
                    if (infoUrl) this.props.dispatchSetPageInfoUrl(infoUrl);
                    if (backgroundImageUrl) this.props.dispatchSetPageBackgroundImageUrl(backgroundImageUrl);
                    if (bannerImageUrl) this.props.dispatchSetPageBannerImageUrl(bannerImageUrl);
                    if (alternateSources) this.props.dispatchSetPageAlternateUrls(alternateSources);
                    if (theme) this.props.dispatchSetPageTheme(theme);
                }

                this.setState({ error: undefined });
            } catch (err) {
                this.handleError(err);
            }
        } else {
            this.setState({ error: lf("No content loaded.") })
        }

        let user = await getUserStateAsync();

        if (fetched && !user.completedTags[fetched]) {
            user.completedTags[fetched] = {};
        }

        this.applyQueryFlags(user, loadedMaps, fetched);
        this.loadedUser = user;
        this.props.dispatchSetUser(user);
    }

    protected async cloudSyncCheckAsync() {
        const res = await this.ready();
        if (!await authClient.loggedInAsync()) {
            this.setState({cloudSyncCheckHasFinished: true});
        } else {
            const doCloudSyncCheckAsync = async () => {
                const state = store.getState();
                const localUser = await getLocalUserStateAsync();

                let currentUser = await getUserStateAsync();
                let headerIds = getFlattenedHeaderIds(localUser, state.pageSourceUrl, currentUser);
                // Tell the editor to transfer local skillmap projects to the cloud.
                const headerMap = (await res.sendMessageAsync!({
                    type: "pxteditor",
                    action: "savelocalprojectstocloud",
                    headerIds
                } as pxt.editor.EditorMessageSaveLocalProjectsToCloud)).resp.headerIdMap;
                if (headerMap) {
                    const newUser: UserState = {
                        ...currentUser,
                        mapProgress: {}
                    }

                    const localUrls = Object.keys(localUser.mapProgress);
                    for (const url of localUrls) {
                        // Copy over local user progress. If there is cloud progress, it will
                        // be overwritten
                        newUser.mapProgress[url] = {
                            ...localUser.mapProgress[url]
                        }

                        const maps = Object.keys(localUser.mapProgress[url]);
                        for (const map of maps) {
                            // Only copy over state if the user hasn't started this map yet
                            if (!hasUrlBeenStarted(currentUser, url)) {
                                newUser.mapProgress[url][map] = {
                                    ...localUser.mapProgress[url][map]
                                };
                                newUser.completedTags[url] = localUser.completedTags[url];
                                const activityState: {[index: string]: ActivityState} = {};
                                newUser.mapProgress[url][map].activityState = activityState;

                                const localProgress = localUser.mapProgress[url][map].activityState
                                for (const activity of Object.keys(localProgress)) {
                                    const localActivity = localProgress[activity];
                                    if (localActivity.headerId) {
                                        activityState[activity] = {
                                            ...localActivity,
                                            headerId: headerMap[localActivity.headerId] || localActivity.headerId
                                        };
                                    }
                                }
                            }
                        }
                    }

                    const visitedUrls = Object.keys(currentUser.mapProgress)
                    // Copy progress from cloud user for all visited URLs.
                    for (const url of visitedUrls) {
                        if (hasUrlBeenStarted(currentUser, url)) {
                            newUser.mapProgress[url] = {
                                ...currentUser.mapProgress[url]
                            }
                            newUser.completedTags[url] = currentUser.completedTags[url]
                        }
                    }

                    this.props.dispatchSetUser(newUser);
                    await saveUserStateAsync(newUser);
                    currentUser = newUser;
                }

                // Tell the editor to send us the cloud status of our projects.
                await res.sendMessageAsync!({
                    type: "pxteditor",
                    action: "requestprojectcloudstatus",
                    headerIds: getFlattenedHeaderIds(currentUser, state.pageSourceUrl)
                } as pxt.editor.EditorMessageRequestProjectCloudStatus);
                this.setState({cloudSyncCheckHasFinished: true});
            }
            // Timeout if cloud sync check doesn't complete in a reasonable timeframe.
            const TIMEOUT_MS = 10 * 1000;
            await Promise.race([
                pxt.U.delay(TIMEOUT_MS).then(() => {
                    if (!this.state.cloudSyncCheckHasFinished)
                        this.setState({cloudSyncCheckHasFinished: true});
                }),
                doCloudSyncCheckAsync()]);
        }
    }

    protected onMakeCodeFrameLoaded = async (sendMessageAsync: (message: any) => Promise<any>) => {
        this.readyPromise.setSendMessageAsync(sendMessageAsync);
    }

    async componentDidMount() {
        this.unsubscribeChangeListener = store.subscribe(this.onStoreChange);
        this.queryFlags = parseQuery();
        if (this.queryFlags["authcallback"]) {
            await authClient.loginCallbackAsync(this.queryFlags);
        }

        await authClient.authCheckAsync();
        await this.initLocalizationAsync();
        await this.parseHashAsync();
        this.readyPromise.setAppMounted();
    }

    componentWillUnmount() {
        window.removeEventListener("hashchange", this.handleHashChange);
        if (this.unsubscribeChangeListener) {
            this.unsubscribeChangeListener();
        }
    }

    render() {
        const { skillMaps, activityOpen, backgroundImageUrl, theme } = this.props;
        const { error } = this.state;
        const maps = Object.keys(skillMaps).map((id: string) => skillMaps[id]);
        return (<div className={`app-container ${pxt.appTarget.id}`}>
                <HeaderBar />
                    <div className={`skill-map-container ${activityOpen ? "hidden" : ""}`} style={{ backgroundColor: theme.backgroundColor }}>
                        { error
                            ? <div className="skill-map-error">{error}</div>
                            : <SkillGraphContainer maps={maps} backgroundImageUrl={backgroundImageUrl} />
                        }
                        { !error && <InfoPanel />}
                    </div>
                    <MakeCodeFrame onFrameLoaded={this.onMakeCodeFrameLoaded}/>
                <AppModal />
                <UserProfile />
            </div>);
    }

    protected applyQueryFlags(user: UserState, maps?: SkillMap[], sourceUrl?: string) {
        const pageSource = sourceUrl || "default";
        if (this.queryFlags["debugNewUser"] === "true") {
            user.isDebug = true;
            user.mapProgress = { [pageSource]: {} };
            user.completedTags = {};
        }

        if (this.queryFlags["debugCompleted"] === "true") {
            user.isDebug = true;
            user.mapProgress = { [pageSource]: {} };

            if (maps) {
                for (const map of maps) {
                    user.mapProgress[pageSource][map.mapId] = {
                        completionState: "completed",
                        mapId: map.mapId,
                        activityState: {}
                    };

                    for (const key of Object.keys(map.activities)) {
                        const activity = map.activities[key];
                        if (!user.mapProgress[pageSource][map.mapId].activityState[activity.activityId]) {
                            user.mapProgress[pageSource][map.mapId].activityState[activity.activityId] = {
                                activityId: activity.activityId,
                                isCompleted: true
                            };
                        }
                        else {
                            user.mapProgress[pageSource][map.mapId].activityState[activity.activityId].isCompleted = true;
                        }

                        if (activity.kind === "activity" && activity.tags?.length && sourceUrl) {
                            for (const tag of activity.tags) {
                                if (!user.completedTags[sourceUrl][tag]) user.completedTags[sourceUrl][tag] = 0;
                                user.completedTags[sourceUrl][tag]++;
                            }
                        }
                    }
                }
            }
        }
    }

    protected onStoreChange = async () => {
        const { user, maps, pageSourceUrl, pageSourceStatus } = store.getState();

        if (user !== this.loadedUser && (!this.loadedUser || user.id === this.loadedUser.id)) {
            // To avoid a race condition where we save to local user's state to the cloud user
            // before we get a chance to run the cloud upgrade rules on projects, we need to wait
            // for cloudSyncCheck to finish if we're logged in.
            if (!this.props.signedIn ||
                (this.props.signedIn && this.state.cloudSyncCheckHasFinished)) {
                await saveUserStateAsync(user);
                this.loadedUser = user;
            }
        }

        if (this.props.signedIn && this.state.cloudSyncCheckHasFinished && pageSourceStatus === "approved") {
            let allBadges: pxt.auth.Badge[] = [];
            for (const map of Object.keys(maps)) {
                allBadges.push(...getCompletedBadges(user, pageSourceUrl, maps[map]))
            }

            if (allBadges.length) {
                const badgeState = await authClient.getBadgeStateAsync() || { badges: [] };
                allBadges = allBadges.filter(badge => !pxt.auth.hasBadge(badgeState, badge))

                if (allBadges.length && !this.state.badgeSyncLock) {
                    this.setState({ badgeSyncLock: true })
                    try {
                        await authClient.grantBadgesAsync(allBadges, badgeState.badges)
                        const prefs = await authClient.userPreferencesAsync();
                        if (prefs) {
                            this.props.dispatchSetUserPreferences(prefs)
                        }
                    }
                    finally {
                        this.setState({ badgeSyncLock: false })
                    }
                }
            }
        }
    }
}

function mapStateToProps(state: SkillMapState, ownProps: any) {
    if (!state) return {};
    return {
        skillMaps: state.maps,
        activityOpen: !!state.editorView,
        backgroundImageUrl: state.backgroundImageUrl,
        theme: state.theme,
        signedIn: state.auth.signedIn
    };
}
interface LocalizationUpdateOptions {
    targetId: string;
    baseUrl: string;
    code: string;
    pxtBranch: string;
    targetBranch: string;
    force?: boolean;
}

async function updateLocalizationAsync(opts: LocalizationUpdateOptions): Promise<void> {
    const {
        targetId,
        baseUrl,
        pxtBranch,
        targetBranch,
        force,
    } = opts;
    let { code } = opts;

    const translations = await pxt.Util.downloadTranslationsAsync(
        targetId,
        baseUrl,
        code,
        pxtBranch,
        targetBranch,
        pxt.Util.liveLocalizationEnabled(),
        ts.pxtc.Util.TranslationsKind.SkillMap
    );

    pxt.Util.setUserLanguage(code);
    if (translations) {
        pxt.Util.setLocalizedStrings(translations);
    }
}

const mapDispatchToProps = {
    dispatchAddSkillMap,
    dispatchClearSkillMaps,
    dispatchClearMetadata,
    dispatchSetPageTitle,
    dispatchSetPageDescription,
    dispatchSetPageInfoUrl,
    dispatchSetUser,
    dispatchSetPageSourceUrl,
    dispatchSetPageAlternateUrls,
    dispatchSetPageBackgroundImageUrl,
    dispatchSetPageBannerImageUrl,
    dispatchSetPageTheme,
    dispatchSetUserPreferences
};

const App = connect(mapStateToProps, mapDispatchToProps)(AppImpl);

export default App;
