// Delay transport — wraps any transport with artificial latency.
// Useful for demos and testing loading/spinner states.

import type { IDataTransport, DataRequest, DataResponse } from './transport';

export interface DelayTransportOptions<T> {
    /** The wrapped transport. */
    transport: IDataTransport<T>;
    /** Delay in milliseconds for read operations. Default: 800. */
    readDelay?: number;
    /** Delay in milliseconds for write operations. Default: 400. */
    writeDelay?: number;
}

function delay(ms: number): Promise<void> {
    return new Promise(r => setTimeout(r, ms));
}

/** Wrap any transport with artificial delay for loading state demos/testing. */
export function delayTransport<T extends Record<string, unknown>>(
    options: DelayTransportOptions<T>,
): IDataTransport<T> {
    const { transport, readDelay = 800, writeDelay = 400 } = options;

    return {
        async read(request: DataRequest): Promise<DataResponse<T>> {
            await delay(readDelay);
            return transport.read(request);
        },
        create: transport.create ? async (item) => {
            await delay(writeDelay);
            return transport.create!(item);
        } : undefined,
        update: transport.update ? async (item) => {
            await delay(writeDelay);
            return transport.update!(item);
        } : undefined,
        patch: transport.patch ? async (id, partial) => {
            await delay(writeDelay);
            return transport.patch!(id, partial);
        } : undefined,
        destroy: transport.destroy ? async (item) => {
            await delay(writeDelay);
            return transport.destroy!(item);
        } : undefined,
        batch: transport.batch ? async (changes) => {
            await delay(writeDelay);
            return transport.batch!(changes);
        } : undefined,
    };
}
