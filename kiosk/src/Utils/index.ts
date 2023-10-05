import { nanoid } from "nanoid";
import * as Constants from "../Constants";
import { HighScoreWithId, NotificationWithId } from "../Types";

export function safeGameName(name: string | undefined): string {
    if (!name || name.toLowerCase() === "untitled") {
        return Constants.defaultGameName;
    }
    return name;
}

export function safeGameDescription(description: string | undefined): string {
    if (!description) {
        return Constants.defaultGameDescription;
    }
    return description;
}

export function makeNotification(
    message: string,
    duration: number
): NotificationWithId {
    return {
        id: nanoid(),
        message,
        duration,
        expiration: Date.now() + duration,
    };
}

export function makeHighScore(
    initials: string,
    score: number
): HighScoreWithId {
    return {
        id: nanoid(),
        initials,
        score,
    };
}

export const debounce = <F extends (...args: Parameters<F>) => ReturnType<F>>(
    func: F,
    waitFor: number
) => {
    let timeout: NodeJS.Timeout;

    const debounced = (...args: Parameters<F>) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), waitFor);
    };

    return debounced;
};

export function classList(...classes: (string | undefined)[]) {
    return classes
        .filter(c => typeof c === "string")
        .reduce((prev, c) => prev.concat(c!.split(" ")), [] as string[])
        .map(c => c.trim())
        .filter(c => !!c)
        .join(" ");
}

export function nodeListToArray<U extends Node>(list: NodeListOf<U>): U[] {
    const out: U[] = [];

    for (const node of list) {
        out.push(node);
    }
    return out;
}
