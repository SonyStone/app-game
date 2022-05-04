const lockState: {
    locked: boolean,
    pending: (() => void)[],
} = {
    locked: false,
    pending: [],
};

export async function lock(f: () => Promise<void>): Promise<void> {
    if (lockState.locked) {
        await new Promise<void>(function (resolve, reject) {
            lockState.pending.push(resolve);
        });

        if (lockState.locked) {
            throw new Error("Invalid lock state");
        }
    }

    lockState.locked = true;

    try {
        return await f();

    } finally {
        lockState.locked = false;

        if (lockState.pending.length !== 0) {
            const resolve = lockState.pending.shift()!;
            // Wake up pending task
            resolve();
        }
    }
}
