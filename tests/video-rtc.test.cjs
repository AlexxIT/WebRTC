const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const test = require('node:test');

function playerWithBuffer(ranges, currentTime) {
    class Events {
        listeners = new Map();
        addEventListener(name, fn) {
            if (!this.listeners.has(name)) this.listeners.set(name, new Set());
            this.listeners.get(name).add(fn);
        }
        removeEventListener(name, fn) { this.listeners.get(name)?.delete(fn); }
        emit(name) { this.listeners.get(name)?.forEach(fn => fn()); }
    }
    const removals = [], seeks = [];
    const buffered = {
        get length() { return ranges.length; },
        start: i => ranges[i][0],
        end: i => ranges[i][1],
    };
    const sb = new Events();
    Object.assign(sb, {updating: false, buffered, remove: (start, end) => removals.push([start, end])});
    let ms;
    class MediaSource extends Events {
        constructor() { super(); ms = this; this.readyState = 'open'; }
        addSourceBuffer() { return sb; }
        setLiveSeekableRange(start, end) { this.range = [start, end]; }
    }
    const context = vm.createContext({
        HTMLElement: class {}, WebSocket: {CLOSED: 3}, window: {}, MediaSource,
        URL: {createObjectURL: () => 'blob:test'}, console,
    });
    const source = fs.readFileSync(path.join(__dirname, '../custom_components/webrtc/www/video-rtc.js'), 'utf8');
    vm.runInContext(source.replace('export class VideoRTC', 'class VideoRTC') + '\nglobalThis.Player = VideoRTC;', context);
    const player = new context.Player();
    const video = new Events();
    Object.assign(video, {play: () => Promise.resolve(), buffered, paused: false, seeking: false, playbackRate: 1});
    Object.defineProperty(video, 'currentTime', {
        get: () => currentTime,
        set: value => { seeks.push(value); currentTime = value; },
    });
    player.video = video;
    player.onmessage = {};
    player.onmse();
    player.onmessage.mse({type: 'mse', value: 'video/mp4; codecs="avc1.42C01E"'});
    return {
        video, ms, removals, seeks, update: () => sb.emit('updateend'),
        seek(time) { currentTime = time; video.emit('seeking'); },
        setRanges(value) { ranges = value; },
    };
}

test('does not evict the playing six-second GOP when the live edge passes five seconds', () => {
    const state = playerWithBuffer([[0, 5.2]], 4.2);
    state.update();
    // MSE extends removal through dependent frames up to the next keyframe.
    // With no second keyframe received, even remove(0, 0.2) clears all video.
    assert.equal(state.removals.length, 0);
    assert.equal(state.seeks.length, 0);
});

test('history cleanup runs behind the playing GOP', () => {
    const state = playerWithBuffer([[0, 36.2]], 35.2);
    state.update();
    assert.equal(state.removals.length, 1);
    // Check the keyframe-aligned removal effect, not only the requested cutoff.
    const actualCutoff = Math.ceil(state.removals[0][1] / 6) * 6;
    assert.ok(actualCutoff > 0 && actualCutoff < state.video.currentTime);
    assert.equal(state.seeks.length, 0);
});

test('live recovery seeks into actual media instead of repeatedly seeking a deleted GOP', () => {
    const state = playerWithBuffer([[23.954, 24.2]], 19.2);
    state.update();
    assert.ok(state.video.currentTime >= 23.954 && state.video.currentTime < 24.2);
    state.update();
    assert.equal(state.seeks.length, 1);
});

test('manual replay is neither forced live nor accelerated', () => {
    const state = playerWithBuffer([[0, 30]], 29);
    state.seek(10);
    state.update();
    assert.equal(state.video.currentTime, 10);
    assert.equal(state.video.playbackRate, 1);
    assert.equal(state.seeks.length, 0);
});

test('seeking near the live edge opts back into catch-up', () => {
    const state = playerWithBuffer([[0, 30]], 29);
    state.seek(10);
    state.update();
    state.seek(28.5);
    state.update();
    assert.ok(state.video.playbackRate > 1);
});

test('updates leave a seek in progress alone', () => {
    const state = playerWithBuffer([[0, 30]], 10);
    state.video.seeking = true;
    state.update();
    assert.equal(state.seeks.length, 0);
    assert.equal(state.video.playbackRate, 1);
});

test('pausing preserves position and bounds history; resume recovers to retained media', () => {
    const state = playerWithBuffer([[0, 30]], 29);
    state.video.paused = true;
    state.video.emit('pause');
    state.setRanges([[0, 100]]);
    state.update();
    assert.equal(state.seeks.length, 0);
    assert.ok(state.removals[0][1] >= 40);
    state.setRanges([[42, 100]]);
    state.video.paused = false;
    state.update();
    assert.equal(state.video.currentTime, 42);
    assert.equal(state.video.playbackRate, 1);
});

test('replay recovers across timestamp gaps without jumping to live', () => {
    const state = playerWithBuffer([[0, 2], [10, 30]], 29);
    state.seek(2.5);
    state.update();
    assert.equal(state.video.currentTime, 10);
    assert.equal(state.video.playbackRate, 1);
});

test('source close removes media event handlers before reconnect', () => {
    const state = playerWithBuffer([[0, 30]], 29);
    assert.equal(state.video.listeners.get('seeking').size, 1);
    state.ms.emit('sourceclose');
    assert.equal(state.video.listeners.get('seeking').size, 0);
    assert.equal(state.video.listeners.get('pause').size, 0);
});
