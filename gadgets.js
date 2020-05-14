
const BASE = 0x3ff7ea1000n;

const bfInstructions = {};

class Gadget {
    frameLocation = null;
    nextRa = null;
    synthesize() {
        throw "not defined";
    }
    getSize() { //size of gadget stack frame
        throw "not defined";
    }
    setFrameLocation(location) {
        this.frameLocation = location;
    }
    getFrameLocation() {
        if (!this.frameLocation) {
            throw "location not defined";
        }
        return this.frameLocation;
    }
    setNextRa(ra) {
        this.nextRa = ra;
    }
    getEntryPoint() {
        throw "not defined";
    }
}

class Sequence extends Gadget {
    constructor(seq){ //array of gadgets
        super();
        this.seq = seq;
    }
    getSize() { //sum of gadget sizes
        return this.seq
            .map(gadget => gadget.getSize())
            .reduce((p, n) => p+n, 0);
    }
    synthesize() {
        let result = [];
        for (let i = 0; i < this.seq.length; i++) {
            let gadget = this.seq[i];
            if(i !== this.seq.length - 1){
                gadget.setNextRa(this.seq[i+1].getEntryPoint());
            }else{
                gadget.setNextRa(this.nextRa);
            }
            result = result.concat(gadget.synthesize());
        }
        return result;
    }
    setFrameLocation(location) {
        super.setFrameLocation(location);
        let nextLocation = location;
        for(let gadget of this.seq){
            gadget.setFrameLocation(nextLocation);
            nextLocation += gadget.getSize();
        }
    }
    getEntryPoint(){
        return this.seq[0].getEntryPoint();
    }
}

class NOP extends Gadget{
    getSize() {
        return 0x10;
    }
    synthesize() {
        return [0, this.nextRa];
    }
    getEntryPoint() {
        return 0x0000000000097a68n + BASE;
    }
}

class PopA0 extends Gadget {
    constructor(a0) {
        super();
        
        this.a0 = a0;
    }
    getSize() {
        return 0x20;
    }
    synthesize() {
        return [
            0n, this.a0, 0n, this.nextRa
        ];
    }
    getEntryPoint() {
        return 0x0000000000058d9en + BASE;
    }
    getPoppedA0Location(){
        return this.getFrameLocation() + 8;
    }
}

class PopS0 extends Gadget {
    constructor(s0) {
        super();

        this.s0 = s0;
    }
    getSize() {
        return 0x10;
    }
    synthesize() {
        return [this.s0, this.nextRa];
    }
    getEntryPoint() {
        return 0x000000000005c172n + BASE;
    }
    getPoppedS0Location() {
        return this.getFrameLocation();
    }
}

class Add1A0 extends Gadget {
    //SIDE EFFECT: also pops s0
    constructor(s0) {
        super();
        this.s0 = s0;
    }
    getSize(){
        return 0x10;
    }
    synthesize() {
        return [
            this.s0,
            this.nextRa
        ]
    }
    getEntryPoint(){
        return 0x000000000006dc7en + BASE;
    }
}

class Dec2A0 extends Gadget {
    getSize(){
        return 0x10;
    }
    synthesize() {
        return [ 0, this.nextRa ];
    }
    getEntryPoint(){
        return 0x000000000006437en + BASE;
    }
}

class _LdA5_S0 extends Gadget {
    /*
    0x00000000000a4ac8 : 
        c.ldsp a4, 0x48(sp)
        c.ld a5, 0(s0)
        bne a4, a5, 0x10
        c.ldsp ra, 0x58(sp)
        c.ldsp s0, 0x50(sp)
        c.addi16sp sp, 0x60
        c.jr ra
    */
    constructor(a4, s0){
        //warning: popped a4 must equal [prev_s0]
        super();
        this.a4 = a4;
        this.s0 = s0;
    }
    getSize() {
        return 0x60;
    }
    synthesize() {
        return [0, 0, 0, 0, 0, 0, 0, 0, 0, this.a4, this.s0, this.nextRa ];
    }
    getEntryPoint() {
        return 0x00000000000a4ac8n + BASE;
    }
}

class PrepareLdA0_A0 extends Sequence {
    constructor() {
        super([
            new PopS0(0x30000000), //scratch space
            new _LdA5_S0(0, 0x30000000),
        ])
    }
}

class _LdA0_8A0 extends Gadget {
    /*
    0x00000000000d3230 : 
        c.ld a0, 8(a0)
        c.add a0, a5
        c.ldsp a4, 0x28(sp)
        c.ld a5, 0(s0)
        bne a4, a5, 0x1e
        c.ldsp ra, 0x38(sp)
        c.ldsp s0, 0x30(sp)
        c.addi16sp sp, 0x40
        c.jr ra
    */
    constructor(a4, s0){
        super();
        this.a4 = a4;
        this.s0 = s0;
    }
    getSize() {
        return 0x40;
    }
    synthesize() {
        return [0, 0, 0, 0, 0, this.a4, this.s0, this.nextRa ]
    }
    getEntryPoint() {
        return 0x00000000000d3230n + BASE;
    }
}

class LdA0_8A0 extends Sequence {
    //reads the value of 8(a0) into a0
    //SIDE EFFECTS: will cobble a4, a5, and s0
    constructor() {
        super([
            new PrepareLdA0_A0(), 
            new _LdA0_8A0(0, 0x30000000)
        ])
    }
}

class SdA0_0x10S0 extends Gadget {
    /*
    0x00000000000d30de : 
        c.ldsp ra, 8(sp)
        c.sd a0, 0x10(s0)
        c.ldsp s0, 0(sp)
        c.addi sp, 0x10
        c.jr ra
    */
   constructor(nextS0){
       super();
       this.nextS0 = nextS0;
   }
   getSize(){
       return 16;
   }
   synthesize() {
       return [this.nextS0, this.nextRa];
   }
   getEntryPoint() {
       return 0x00000000000d30den + BASE;
   }
}

class WriteA0 extends Sequence {
    constructor(dest, nextS0) {
        super([
            new PopS0(dest-0x10),
            new SdA0_0x10S0(nextS0)
        ])
    }
}

class Spacer extends Gadget {
    constructor(size){
        super();
        this.size = size;
    }
    getSize() {
        return this.size * 8;
    }
    synthesize(){
        return new Array(this.size).fill(0);
    }
    getEntryPoint(){
        return 0;
    }
}

class _PopA5 extends Gadget {
    //SIDE EFFECT: cobbles a0
    /*
    0x000000000002d9d6 : 
        c.ldsp a5, 8(sp)
        c.ldsp ra, 0x18(sp)
        c.mv a0, a5
        c.addi16sp sp, 0x20
        c.jr ra
    */
   constructor(a5) {
       super();
       this.a5 = a5;
   }
   getSize(){
       return 0x20;
   }
   synthesize() {
       return [0, this.a5, 0, this.nextRa]
   }
   getEntryPoint() {
       return 0x000000000002d9d6n + BASE;
   }
}


class _CallA5 extends Gadget {
    //PRECONDITION: s0+50 is valid scratch space
    //SIDE EFFECT: pops s0, a0 is set to the retval
    /*
    0x00000000000b95d4 : 
        c.jalr a5
        c.ldsp ra, 8(sp)
        sd zero, 0x50(s0)
        c.ldsp s0, 0(sp)
        c.addi sp, 0x10
        c.jr ra
    */
    constructor(s0) {
        super();
        this.s0 = s0;
    }
    getSize(){
        return 0x10;
    }
    synthesize() {
        return [this.s0, this.nextRa];
    }
    getEntryPoint(){
        return 0x00000000000b95d4n + BASE;
    }
}

class _Longjmp extends Gadget {
    getSize() {
        return 0;
    }
    synthesize() {
        return [];
    }
    getEntryPoint() {
        return 0x00000000000325b4n + BASE;
    }
}

class StackPivot extends Sequence {
    constructor(destRa, destSp) {
        super([
            new PopA0(null),
            new _Longjmp()
        ])
        if(destRa && destSp){
            this.setDest(destRa, destSp);
        }
    }
    setDest(ra, sp) {
        this.seq[0] = new PopA0(jmpBuf.makeTarget(ra, sp))
    }
}

class SeqzA0 extends Gadget {
    getSize() {
        return 0x10;
    }
    synthesize() {
        return [0, this.nextRa];
    }
    getEntryPoint(){
        return 0x00000000000d1ad6n + BASE
    }
}

class PopS0S1S2 extends Gadget {
    constructor(s0, s1, s2){
        super();
        this.s0 = s0;
        this.s1 = s1;
        this.s2 = s2;
    }
    getSize() {
        return 0x20;
    }
    synthesize() {
        return [
            this.s2, this.s1, this.s0, this.nextRa
        ]
    }
    getEntryPoint() {
        return 0xa3b34n + BASE
    }
}

class _AddA5A0 extends Gadget {
    constructor(s0, s1, s2, s3){
        super();
        this.s0 = s0;
        this.s1 = s1;
        this.s2 = s2;
        this.s3 = s3;
    }
    getSize(){
        return 0x30;
    }
    synthesize() {
        return [0, this.s3, this.s2, this.s1, this.s0, this.nextRa];
    }
    getEntryPoint(){
        return 0x0000000000060f40n + BASE
    }
}

class _AddA0A5 extends Gadget {
    getSize(){
        return 0x50;
    }
    synthesize() {
        return [0, 0, 0, 0, 0, 0, 0, 0, 0, this.nextRa];
    }
    getEntryPoint(){
        return 0x00000000000a91c0n + BASE;
    }
}

//based on the truthiness of a0
class ConditionalStackPivot extends Sequence {
    //cobbles a0
    constructor(){
        super([
            new WriteA0(null, 0), //make a copy of a0 before the next gadget cobbles it
            new _PopA5(0), //want a5 = 8*Seqz(A0), cobbles a0
            new PopA0(0), //restored value from before
            new SeqzA0(),
            new PopS0S1S2(0, 0, 0x30000000),
            new _AddA5A0(0, 0, 0x30000000, 0), //add a5 to a0 8 times
            new _AddA5A0(0, 0, 0x30000000, 0),
            new _AddA5A0(0, 0, 0x30000000, 0),
            new _AddA5A0(0, 0, 0x30000000, 0),
            new _AddA5A0(0, 0, 0x30000000, 0),
            new _AddA5A0(0, 0, 0x30000000, 0),
            new _AddA5A0(0, 0, 0x30000000, 0),
            new _AddA5A0(0, 0, 0x30000000, 0),
            new PopA0(null), //the jump buffer
            new _AddA0A5(),
            new _Longjmp()
        ])
    }
    setFrameLocation(location){
        super.setFrameLocation(location);
        
        this.seq[0] = new WriteA0(this.seq[2].getPoppedA0Location(), 0);

        super.setFrameLocation(location);
    }
    setDests(trueRa, trueSp, falseRa, falseSp){
        if(jmpBuf.nextSpot % 13 === 12) { //we cannot allocate two more jump buffers or else they will be split
            jmpBuf.makeTarget(0, 0); //allocate a dummy so we move on to the next set
        }
        const trueJmp = jmpBuf.makeTarget(trueRa, trueSp);
        const falseJmp = jmpBuf.makeTarget(falseRa, falseSp);
        if(falseJmp !== trueJmp + 8) {
            throw "jmpbuf didn't allocate contiguously";
        }
        
        if(!this.seq[13].getPoppedA0Location){
            throw "expected pop a0 gadget";
        }
        this.seq[13] = new PopA0(trueJmp);
    }
}

class WriteVal extends Sequence {
    //preserves A0
    constructor(val, dest) {
        super([
            new WriteA0(null, 0),
            new PopA0(val),
            new WriteA0(dest, 0),
            new PopA0(0)
        ])
    }
    setFrameLocation(location) {
        super.setFrameLocation(location);

        this.seq[0] = new WriteA0(this.seq[3].getPoppedA0Location(), 0);

        super.setFrameLocation(location);
    }
}

class WriteVals extends Sequence {
    constructor(vals, dest) {
        super(vals.map((val, i) => new WriteVal(val, dest + 8*i)));
    }
}

class CallFunc extends Sequence {
    //may cobble all coller-saved regs
    //retval stored in a0
    constructor(func) {
        super([
            new WriteVals([0, 0, 0, 0, 0, 0], 0),
            new WriteA0(null, 0),
            new _PopA5(func), //putchar
            new StackPivot(null, null),
            new Spacer(512),
            new PopA0(0), //this will get overwritten
            new PopS0(0x30000000), //this too
            new _CallA5(0),
        ]);
    }

    setFrameLocation(location) {
        super.setFrameLocation(location);
        
        this.seq[0] = new WriteVals([0, 0, 0, this.seq[6].getEntryPoint(), 0x30000000, this.seq[7].getEntryPoint()], this.seq[5].getFrameLocation());
        this.seq[1] = new WriteA0(this.seq[5].getPoppedA0Location(), 0);
        this.seq[3] = new StackPivot(this.seq[5].getEntryPoint(), this.seq[5].getFrameLocation()); //TODO UPDATE

        super.setFrameLocation(location);
    }
}

class OutputCharAtA0 extends Sequence {
    constructor() {
        super([
            new WriteA0(null, 0),
            new Sub8FromA0(),
            new LdA0_8A0(),
            new CallFunc(0x000000000005b70an + BASE), //putchar
            new PopA0(0)
        ])
    }
    setFrameLocation(location){
        super.setFrameLocation(location);

        this.seq[0] = new WriteA0(this.seq[4].getPoppedA0Location(), 0);

        super.setFrameLocation(location);
    }
}

class InputCharAtA0 extends Sequence {
    constructor() {
        super([
            new WriteA0(null, 0), //write to the pop A0
            new Sub8FromA0(),
            new Sub8FromA0(),
            new WriteA0(null, 0), //write to the pop S0
            new CallFunc(0x000000000005eaa6n + BASE), //getchar
            new PopS0(0),
            new SdA0_0x10S0(0),
            new PopA0(0)
        ])
    }
    setFrameLocation(location){
        super.setFrameLocation(location);

        this.seq[0] = new WriteA0(this.seq[7].getPoppedA0Location(), 0);
        this.seq[3] = new WriteA0(this.seq[5].getPoppedS0Location(), 0);

        super.setFrameLocation(location);
    }
}

class BeginLoop extends Sequence {
    constructor() {
        super([
            new WriteA0(null, 0), //should write to the below gadget
            new PopA0(0), //this is where EndLoop will jump back
            new WriteA0(null, 0), //write to our conditional branch target
            new WriteA0(null, 0), //write to their conditional branch target
            new Sub8FromA0(),
            new LdA0_8A0(), //read the value into a0
            new ConditionalStackPivot(),
            new PopA0(0),
        ])
    }
    setFrameLocation(location){
        super.setFrameLocation(location);

        this.seq[0] = new WriteA0(this.seq[1].getPoppedA0Location(), 0);
        this.seq[2] = new WriteA0(this.seq[7].getPoppedA0Location(), 0);

        super.setFrameLocation(location);
    }
    setEnd(endLoop){ //called after setFrameLocation
        const endPop = endLoop.seq[2];
        const beginPop = this.seq[7];
        this.seq[3] = new WriteA0(endPop.getPoppedA0Location(), 0);

        this.seq[6].setDests(beginPop.getEntryPoint(), beginPop.getFrameLocation(), endPop.getEntryPoint(), endPop.getFrameLocation());
    }
}

class EndLoop extends Sequence {
    constructor() {
        super([
            new WriteA0(null, 0), 
            new StackPivot(null, null),
            new PopA0(0)
        ])
    }
    setBeginning(beginLoop) { //should be called after setFrameLocation
        const popA0 = beginLoop.seq[1]
        this.seq[0] = new WriteA0(popA0.getPoppedA0Location(), 0);
        this.seq[1] = new StackPivot(popA0.getEntryPoint(), popA0.getFrameLocation());
    }
}

class Add8ToA0 extends Sequence {
    //SIDE EFFECT: sets s0 to 0
    constructor() {
        super([
            new Add1A0(0),
            new Add1A0(0),
            new Add1A0(0),
            new Add1A0(0),
            new Add1A0(0),
            new Add1A0(0),
            new Add1A0(0),
            new Add1A0(0), //s0 = 0
        ])
    }
}

class Sub8FromA0 extends Sequence {
    constructor() {
        super([
            new Dec2A0(),
            new Dec2A0(),
            new Dec2A0(),
            new Dec2A0(),
        ])
    }
}

class IncrementAtA0 extends Sequence {
    constructor() {
        super([
            new WriteA0(null, 0),
            new Sub8FromA0(),
            new Sub8FromA0(),
            new WriteA0(null, 0),
            new Add8ToA0(),
            new LdA0_8A0(),
            new Add1A0(0), 
            new PopS0(0),
            new SdA0_0x10S0(0),
            new PopA0(0),
        ])
    }
    setFrameLocation(location){
        super.setFrameLocation(location);
        
        //fill in the self-modifying ROP chain destinations
        this.seq[0] = new WriteA0(this.seq[9].getPoppedA0Location(), 0);
        this.seq[3] = new WriteA0(this.seq[7].getPoppedS0Location(), 0);

        super.setFrameLocation(location);
    }
}

class DecrementAtA0 extends Sequence {
    constructor() {
        super([
            new WriteA0(null, 0),
            new Sub8FromA0(),
            new Sub8FromA0(),
            new WriteA0(null, 0),
            new Add8ToA0(),
            new LdA0_8A0(),
            new Add1A0(0), 
            new Dec2A0(), 
            new PopS0(0),
            new SdA0_0x10S0(0),
            new PopA0(0),
        ])
    }
    setFrameLocation(location){
        super.setFrameLocation(location);
        
        //fill in the self-modifying ROP chain destinations
        this.seq[0] = new WriteA0(this.seq[10].getPoppedA0Location(), 0);
        this.seq[3] = new WriteA0(this.seq[8].getPoppedS0Location(), 0);

        super.setFrameLocation(location);
    }
}

bfInstructions['>'] = Add8ToA0;
bfInstructions['<'] = Sub8FromA0;
bfInstructions['+'] = IncrementAtA0;
bfInstructions['-'] = DecrementAtA0;
bfInstructions['.'] = OutputCharAtA0;
bfInstructions[','] = InputCharAtA0;
bfInstructions['['] = BeginLoop;
bfInstructions[']'] = EndLoop;

function createProgram(gadgets) {
    const result = new Sequence([new NOP(), ...gadgets]);

    result.setNextRa(new NOP().getEntryPoint());
    result.setFrameLocation(0x10000000);

    return result;
}

//beginningIndex -- index of a [
//return value -- index of the corresponding ]
function getLoopEnd(bf, beginningIndex) {
    if(bf.charAt(beginningIndex) !== '['){
        throw "beginningIndex is not a beginning";
    }
    let levels = 0;
    for(let i = beginningIndex; i < bf.length; i++){
        if(bf.charAt(i) === '['){
            levels++;
        }else if(bf.charAt(i) === ']'){
            levels--;
        }
        if(levels === 0) return i;
    }
    
    throw "no end found";
}

function sanitizeBrainfuck(bf) {
    return bf.split('').filter(ch => bfInstructions[ch]).join('');
}

function brainfuckToRop(bf) {
    let initSeq = [new NOP(), new PopA0(0x38000000)];
    let endSeq = [new PopA0(0), new CallFunc(0x00000000000342e4n + BASE)] //exit(0)

    let seq = initSeq.concat(
        bf.split('')
            .map(instr => 
                bfInstructions[instr]
                    ? new bfInstructions[instr]()
                    : new NOP())
    ).concat(endSeq);

    const result = new Sequence(seq);
    
    result.setNextRa(new NOP().getEntryPoint());
    result.setFrameLocation(0x10000000);

    //initialize the loops
    for(let i = 0; i < bf.length; i++){
        if(bf.charAt(i) == '['){
            const beginIndex = i;
            const endIndex = getLoopEnd(bf, i);
            const beginLoop = result.seq[initSeq.length + beginIndex];
            const endLoop = result.seq[initSeq.length + endIndex];
            beginLoop.setEnd(endLoop);
            endLoop.setBeginning(beginLoop);
        }
    }

    return result;
}

function showRopChain(gadget){
    document.getElementById('stackbuf').innerHTML = (gadget.synthesize().map(num => num.toString(16)).join("\n"));
    document.getElementById('jmpbuf').innerHTML = (jmpBuf.synthesize().map(num => num.toString(16)).join("\n"));
}

function generateCode() {
    showRopChain(brainfuckToRop(sanitizeBrainfuck(document.getElementById("source").value)));

    return false;
}