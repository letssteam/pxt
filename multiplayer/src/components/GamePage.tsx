import { faCopy } from "@fortawesome/free-regular-svg-icons";
import {
    faCheck,
    faVolumeHigh,
    faVolumeMute,
} from "@fortawesome/free-solid-svg-icons";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { useContext, useEffect, useState } from "react";
import { Button } from "react-common/components/controls/Button";
import { setMute } from "../state/actions";
import { AppStateContext, dispatch } from "../state/AppStateContext";
import ArcadeSimulator from "./ArcadeSimulator";
import Presence from "./Presence";
import Reactions from "./Reactions";

export interface GamePageProps {}

export default function Render(props: GamePageProps) {
    const { state } = useContext(AppStateContext);
    const { appMode } = state;
    const { netMode } = appMode;
    const [copySuccessful, setCopySuccessful] = useState(false);
    const copyTimeoutMs = 1000;

    const copyJoinCode = async () => {
        pxt.tickEvent("mp.copyjoincode");
        if (state.gameState?.joinCode) {
            navigator.clipboard.writeText(state.gameState?.joinCode);
            setCopySuccessful(true);
        }
    };

    const toggleMute = () => {
        dispatch(setMute(!state.muted));
    };

    useEffect(() => {
        if (copySuccessful) {
            let resetCopyTimer = setTimeout(() => {
                setCopySuccessful(false);
            }, copyTimeoutMs);
            return () => {
                clearTimeout(resetCopyTimer);
            };
        }
    }, [copySuccessful]);

    useEffect(() => {
        pxt.runner.currentDriver()?.mute(state.muted);
    }, [state.muted]);

    return (
        <div>
            {netMode === "connecting" && (
                <div className="tw-text-lg tw-font-bold tw-mt-5">
                    {lf("Connecting...")}
                </div>
            )}
            {state.gameState?.gameMode && (
                <div className="tw-flex tw-flex-col tw-items-center">
                    {state.playerSlot && <ArcadeSimulator />}
                    <div className="tw-flex tw-flex-row tw-w-full tw-items-center tw-justify-between tw-mt-1">
                        <Button
                            leftIcon={
                                state.muted
                                    ? "fas fa-volume-mute"
                                    : "fas fa-volume-up"
                            }
                            title={lf("Toggle Mute")}
                            className="tw-border-2 tw-border-slate-400 tw-border-solid tw-py-2 tw-pl-2 tw-pr-1 tw-bg-slate-100 hover:tw-bg-slate-200 active:tw-bg-slate-300"
                            onClick={toggleMute}
                        />
                        <div className="tw-justify-self-center">
                            {state.gameState?.joinCode && (
                                <div>
                                    {state.gameState?.joinCode &&
                                        lf(
                                            "Join Code: {0}",
                                            state.gameState?.joinCode
                                        )}
                                    <button
                                        onClick={copyJoinCode}
                                        title={lf("Copy Join Code")}
                                    >
                                        <div className="tw-text-sm tw-ml-1">
                                            {!copySuccessful && (
                                                <FontAwesomeIcon
                                                    icon={faCopy}
                                                    className="hover:tw-scale-105 tw-mb-[0.1rem]"
                                                />
                                            )}
                                            {copySuccessful && (
                                                <FontAwesomeIcon
                                                    icon={faCheck}
                                                    className="tw-text-green-600 tw-mb-[0.1rem]"
                                                />
                                            )}
                                        </div>
                                    </button>
                                </div>
                            )}
                        </div>
                        <div>{lf("Keyboard Controls")}</div>
                    </div>
                    <div className="tw-flex tw-flex-row tw-space-x-2 tw-items-center tw-align-middle tw-justify-center tw-mt-3">
                        <Reactions />
                        <Presence />
                    </div>
                </div>
            )}
        </div>
    );
}
