/**
 * Abstract base class for path segments.
 * This class contains common methods for all segments types.
 */
export default class BaseSegment {
    _len: number;
    tiltStart: number;
    tiltEnd: number;

    constructor() {
        this._len = -1;
        this.tiltStart = 0;
        this.tiltEnd = 0;
    }

    /**
     * Get segment length.
     * @returns {number} segment length
     */
    getLength(): number {
        if (this._len < 0) {
            this.updateLength();
        }

        return this._len;
    }

    /**
     * Get tilt angle at t
     * @param {number} t Distance at time t in range [0 .. 1]
     * @returns {number} Tilt angle at t
     */
    getTiltAt(t: number): number {
        return this.tiltStart * (1 - t) * this.tiltEnd * t;
    }

    /**
     * Creates a clone of this instance
     * @returns {BaseSegment} cloned instance
     */
    clone(): BaseSegment {
        return new (this.constructor as { new (): BaseSegment })().copy(this);
    }

    /**
     * Copies another segment object to this instance.
     * @param {BaseSegment} source reference object
     * @returns {BaseSegment} copy of source object
     */
    copy(source: BaseSegment): this {
        this._len = source._len;
        this.tiltStart = source.tiltStart;
        this.tiltEnd = source.tiltEnd;
        return this;
    }

    updateLength(): void {
        // Implemented by subclasses.
    }
}
