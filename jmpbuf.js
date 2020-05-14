class JmpBuf {
    constructor(base){
        this.base = base;
        this.nextSpot = 0;
        this.buf = new Array(26).fill(0);
    }
    _nextRaLoc(){
        return this.nextSpot;
    }
    _nextSpLoc() {
        return this.nextSpot + 13;
    }
    _advancePtr() {
        this.nextSpot ++;
        if(this.nextSpot % 13 === 0) {
            this.nextSpot += 13;
            this.buf = this.buf.concat(new Array(26).fill(0));
        }
    }
    makeTarget(ra, sp){ //returns what a0 should be
        const res = this._nextRaLoc();
        this.buf[this._nextRaLoc()] = ra;
        this.buf[this._nextSpLoc()] = sp;
        this._advancePtr();
        return res * 8 + this.base;
    }

    synthesize() {
        return this.buf;
    }
}

const jmpBuf = new JmpBuf(0x20000000);