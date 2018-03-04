/**
 * This module contains a set of classes that add abstraction over the
 * low-level functions in the LLVM C API.
 *
 * Unlike using the lower-level functions, these wrappers aim for *type
 * safety* in the TypeScript level. As much as possible, you use a real
 * TypeScript class instead of an opaque pointer from the API.
 */

import * as ref from 'ref';
import { finalize } from './finalize';
import { PointerArray, voidp } from './types';
import { LLVM } from './llvmc';

////////////////////////////////////////////////////////
// Base Types & Interfaces
////////////////////////////////////////////////////////

/**
 * A base class for our wrapper classes that abstract an `LLVM*Ref` type.
 */
export abstract class Ref {
    public ref: any;

    /**
     * Create a new wrapper for an underlying `LLVM*Ref` value.
     */
    constructor(ref: any) {
        this.ref = ref;
    }
}

/**
 * An LLVM wrapper object that has a `free` method that you must call when
 * you're done with the memory.
 */
export interface Freeable {
    free(): void;
}

//////////////////////////////////////////////////////////
// Utility functions
//////////////////////////////////////////////////////////

/**
 * Convert a normal JavaScript Ref array to a PointerArray
 */
function genPtrArray(array: Ref[]) {
    let ptrArray = new PointerArray(array.length);
    let i = 0;
    for (let elem of array) {
        ptrArray[i] = array[i].ref;
        ++i;
    }
    return ptrArray
}

//////////////////////////////////////////////////////////
// Context
//////////////////////////////////////////////////////////

/**
 * A class for the LLVM Context module
 */
export class Context extends Ref {
    static create(): Context {
        let cref = LLVM.LLVMContextCreate();
        return new Context(cref);
    }

    /**
     * Retrieve global context
     */
    static getGlobal(): Context {
        let cref = LLVM.LLVMGetGlobalContext();
        return new Context(cref);
    }
}

//////////////////////////////////////////////////////////
// Module
//////////////////////////////////////////////////////////

/**
 * Represents an LLVM module: specifically, and underlying `LLVMModuleRef`.
 */
export class Module extends Ref implements Freeable {
    static create(name: String, ctx?: Context): Module {
        let modref = ctx ? LLVM.LLVMModuleCreateWithNameInContext(name, ctx) : LLVM.LLVMModuleCreateWithName(name);
        let mod = new Module(modref);

        finalize(mod, function (this: Module) {
            mod.free();
        });

        return mod;
    }

    /**
     * Free the memory for this module.
     */
    free(): void {
        LLVM.LLVMDisposeModule(this.ref);
        this.ref = null;
    }

    /**
     * Set the target triple for the module
     */
    setTarget(targetTriple: string): void {
        LLVM.LLVMSetTarget(this.ref, targetTriple);
    }

    /**
     * Set data layout for module
     */
    setDataLayout(triple: string): void {
        LLVM.LLVMSetDataLayout(this.ref, triple);
    }

    /**
     * Dump the IR to a file on disk.
     */
    writeBitcodeToFile(filename: string): number {
        return LLVM.LLVMWriteBitcodeToFile(this.ref, filename);
    }

    /**
     * Dump the textual IR to a string.
     */
    toString(): string {
        return LLVM.LLVMPrintModuleToString(this.ref);
    }

    /**
     * Add a function to the module, returning a `Function` wrapper.
     */
    addFunction(name: string, type: FunctionType): Function {
        let funcref = LLVM.LLVMAddFunction(this.ref, name, type.ref);
        return new Function(funcref);
    }

    /**
     * Retrieve the function in module with provided name
     */
    getFunction(name: string): Function {
        let funcref = LLVM.LLVMGetNamedFunction(this.ref, name);
        return new Function(funcref);
    }

    /**
     * TODO: not complete yet (replica of C++ Module.getOrInsertFunction)
     */
    getOrInsertFunction(name: string, type: FunctionType): Function {
        let func = this.getFunction(name);
        if (func.ref.isNull()) {
            // TODO: do some stuff with attributes?
            return this.addFunction(name, type);
        }

        // TODO: check if typing is correct, if it isn't do a cast

        return func;
    }
}

//////////////////////////////////////////////////////////
// Types
//////////////////////////////////////////////////////////

/**
 * An LLVM type; wraps `LLVMTypeRef`.
 */
export class Type extends Ref { }

/**
 * Void type
 */
export class VoidType extends Type {
    static create(): VoidType {
        return new VoidType(LLVM.LLVMVoidType());
    }
}

/**
 * Integer types
 */
export class IntType extends Type {
    /**
     * Get the i1 type.
     */
    static createInt1(): IntType {
        return new IntType(LLVM.LLVMInt1Type());
    }

    /**
     * Get the i8 type.
     */
    static createInt8(): IntType {
        return new IntType(LLVM.LLVMInt8Type());
    }

    /**
     * Get the i16 type.
     */
    static createInt16(): IntType {
        return new IntType(LLVM.LLVMInt16Type());
    }

    /**
     * Get the i32 type.
     */
    static createInt32(): IntType {
        return new IntType(LLVM.LLVMInt32Type());
    }

    /**
     * Get the i64 type.
     */
    static createInt64(): IntType {
        return new IntType(LLVM.LLVMInt64Type());
    }

    /**
     * Get the i128 type.
     */
    static createInt128(): IntType {
        return new IntType(LLVM.LLVMInt128Type());
    }
}

/**
 * Floating point types
 */
export class FloatType extends Type {
    /**
     * Get a float type
     */
    static createFloat(): FloatType {
        return new FloatType(LLVM.LLVMFloatType());
    }

    /**
     * Get a double type
     */
    static createDouble(): FloatType {
        return new FloatType(LLVM.LLVMDoubleType());
    }
}

/**
 * Wraps function type
 */
export class FunctionType extends Type {
    static create(ret: Type, params: Type[], isVarArg = false): FunctionType {
        // Construct the function type.
        let ftref = LLVM.LLVMFunctionType(ret.ref, genPtrArray(params), params.length, isVarArg);
        return new FunctionType(ftref);
    }
}

/**
 * Wraps structure type
 */
export class StructType extends Type {
    static create(elementTypes: Type[], packed: boolean): StructType {
        let _elementTypes = genPtrArray(elementTypes);
        let sref = LLVM.LLVMStructType(_elementTypes, elementTypes.length, packed);
        return new StructType(sref);
    }

    /**
     * Get number of elems in struct
     */
    numStructElements(): number {
        return LLVM.LLVMCountStructElementTypes(this.ref);
    }

    /**
     * Get type of element at provided index
     */
    getTypeAt(index: number): Type {
        let tref = LLVM.LLVMStructGetTypeAtIndex(this.ref, index);
        return new Type(tref);
    }

    /**
     * Iterate over the types in the param.
     */
    *types() {
        let count = this.numStructElements();
        for (let i = 0; i < count; ++i) {
            yield this.getTypeAt(i);
        }
    }
}

/**
 * Sequential Type
 */
export class SequentialType extends Type { }

export class ArrayType extends Type {
    static create(type: Type, count: number): ArrayType {
        let aref = LLVM.LLVMArrayType(type.ref, count);
        return new ArrayType(aref);
    }
}

/**
 * Wraps pointer type
 */
export class PointerType extends SequentialType {
    static create(type: Type, addressSpace: number): PointerType {
        let pref = LLVM.LLVMPointerType(type.ref, addressSpace);
        return new PointerType(pref);
    }
}

//////////////////////////////////////////////////////////
// Values
//////////////////////////////////////////////////////////

/**
 * Wraps *any* LLVM value via an `LLVMValueRef`.
 */
export class Value extends Ref {
    /**
     * Get an undef of provided type
     */
    static getUndef(type: Type): Value {
        let vref = LLVM.LLVMGetUndef(type.ref);
        return new Value(vref);
    }

    /**
     * get null instance of provided type
     */
    static constNull(type: Type): Value {
        let vref = LLVM.LLVMConstNull(type.ref);
        return new Value(vref);
    }

    /**
     * Obtain a constant that is a constant pointer pointing to NULL for a specified type
     */
    static constPointerNull(type: Type): Value {
        let vref = LLVM.LLVMConstPointerNull(type.ref);
        return new Value(vref);
    }

    /**
     * Get the value's name.
     */
    getName(): string {
        return LLVM.LLVMGetValueName(this.ref);
    }

    /**
     * Set the value's name.
     */
    setName(name: string): void {
        LLVM.LLVMSetValueName(this.ref, name);
    }
}

/**
 * Constant value
 */
export class Constant extends Value { }

/**
 * Represents an LLVM function, wrapping an `LLVMValueRef` that points to a
 * function.
 */
export class Function extends Constant {
    /**
     * Add a new basic block to this function.
     */
    appendBasicBlock(name: string): BasicBlock {
        let bbref = LLVM.LLVMAppendBasicBlock(this.ref, name);
        return new BasicBlock(bbref);
    }

    /**
     * Return function's entry block
     */
    getEntryBlock(): BasicBlock {
        let bbref = LLVM.LLVMGetEntryBasicBlock(this.ref);
        return new BasicBlock(bbref);
    }

    /**
     * Get number of parameters to the function.
     */
    countParams(): number {
        return LLVM.LLVMCountParams(this.ref);
    }

    /**
     * Get function parameter at the specified index.
     */
    getParam(idx: number): Value {
        return new Value(LLVM.LLVMGetParam(this.ref, idx));
    }

    /**
     * Iterate over the parameters in the function.
     */
    *params() {
        let count = this.countParams();
        for (let i = 0; i < count; ++i) {
            yield this.getParam(i);
        }
    }

    /**
     * Delete the function from its containing module.
     */
    deleteFromParent(): void {
        LLVM.LLVMDeleteFunction(this.ref);
    }
}

/**
 * Scalar constant
 */
export class ConstScalar extends Constant { }

/**
 * Integer constant
 */
export class ConstInt extends ConstScalar {
    static create(value: number, type: Type): ConstInt {
        let vref = LLVM.LLVMConstInt(type.ref, value, false);
        return new ConstInt(vref);
    }

    static createFalse(): ConstInt {
        let vref = LLVM.LLVMConstInt(LLVM.LLVMInt1Type(), 0, false);
        return new ConstInt(vref);
    }

    static createTrue(): ConstInt {
        let vref = LLVM.LLVMConstInt(LLVM.LLVMInt1Type(), 1, false);
        return new ConstInt(vref);
    }
}

/**
 * Float constant
 */
export class ConstFloat extends ConstScalar {
    static create(value: number, type: Type): ConstFloat {
        let vref = LLVM.LLVMConstReal(type.ref, value);
        return new ConstFloat(vref);
    }
}

/**
 * Composite scalar
 */
export class ConstComposite extends Constant { }

/**
 * String constant
 */
export class ConstString extends ConstComposite {
    /**
     * Create a ConstantDataSequential with string content in the provided context
     */
    static createInContext(context: Context, value: string, dontNullTerminate: boolean): ConstString {
        let vref = LLVM.LLVMConstStringInContext(context.ref, value, value.length, dontNullTerminate);
        return new ConstString(vref);
    }

    /**
     * Create a ConstantDataSequential with string content in the global context
     */
    static create(value: string, dontNullTerminate: boolean): ConstString {
        let vref = LLVM.LLVMConstString(value, value.length, dontNullTerminate);
        return new ConstString(vref);
    }
}

/**
 * Struct constant
 */
export class ConstStruct extends ConstComposite {
    /**
     * Create a ConstantStruct in the global Context.
     */
    static create(vals: Value[], packed: boolean): ConstStruct {
        let _vals = genPtrArray(vals);
        let sref = LLVM.LLVMConstStruct(_vals, vals.length, packed);
        return new ConstStruct(sref);
    }

    /**
     * Create a non-anonymous ConstantStruct from values.
     */
    static createNamed(structType: StructType, vals: Value[]): ConstStruct {
        let _vals = genPtrArray(vals);
        let sref = LLVM.LLVMConstNamedStruct(structType.ref, _vals, vals.length);
        return new ConstStruct(sref)
    }
}

/**
 * Array constant
 */
export class ConstArray extends ConstComposite {
    static create(type: Type, vals: Value[]): ConstArray {
        let _vals = genPtrArray(vals);
        let aref = LLVM.LLVMConstArray(type.ref, _vals, vals.length);
        return new ConstArray(aref);
    }
}

//////////////////////////////////////////////////////////
// Basic Block
//////////////////////////////////////////////////////////

export class BasicBlock extends Ref {
    /**
     * Obtain the function to which this basic block belongs
     */
    getParent(): Function {
        let fref = LLVM.LLVMGetBasicBlockParent(this.ref);
        return new Function(fref);
    }

    /**
     * Obtain first instruction of basic block
     */
    getFirstInstr(): Value {
        let vref = LLVM.LLVMGetFirstInstruction(this.ref);
        return new Value(vref);
    }

    /**
     * Obtain last instruction of basic block
     */
    getLastInstr(): Value {
        let vref = LLVM.LLVMGetLastInstruction(this.ref);
        return new Value(vref);
    }
}

///////////////////////////////////////////////////////
// Builder
///////////////////////////////////////////////////////

/**
 * Represents an LLVM IR builder.
 */
export class Builder extends Ref implements Freeable {
    static create(ctx?: Context): Builder {
        let bref = ctx ? LLVM.LLVMCreateBuilderInContext(ctx) : LLVM.LLVMCreateBuilder();
        const builder = new Builder(bref);

        finalize(builder, function (this: Builder) {
            builder.free();
        });

        return builder;
    }

    /**
     * Free the memory for this builder.
     */
    free(): void {
        LLVM.LLVMDisposeBuilder(this.ref);
        this.ref = null;
    }

    /**
     * Get builder's insert block
     */
    getInsertBlock(): BasicBlock {
        let bbref = LLVM.LLVMGetInsertBlock(this.ref);
        return new BasicBlock(bbref);
    }

    /**
     * Position the builder after the provided instruction
     */
    positionAfter(bb: BasicBlock, instr: Value): void {
        LLVM.LLVMPositionBuilder(this.ref, bb.ref, instr.ref);
    }

    /**
     * Position the builder before the provided instruction
     */
    positionBefore(instr: Value): void {
        LLVM.LLVMPositionBuilderBefore(this.ref, instr.ref);
    }

    /**
     * Position the builder's insertion point at the end of the given basic block.
     */
    positionAtEnd(bb: BasicBlock): void {
        LLVM.LLVMPositionBuilderAtEnd(this.ref, bb.ref);
    }

    /**
     * Build function call
     */
    buildCall(func: Value, args: Value[], name: string): Value {
        let vref = LLVM.LLVMBuildCall(this.ref, func.ref, genPtrArray(args), args.length, name);
        return new Value(vref);
    }

    /**
     * Create alloca
     */
    buildAlloca(type: Type, name: string): Value {
        let vref = LLVM.LLVMBuildAlloca(this.ref, type.ref, name);
        return new Value(vref);
    }

    /**
     * Obtain value pointed to by ptr
     */
    buildLoad(ptr: Value, name: string): Value {
        let vref = LLVM.LLVMBuildLoad(this.ref, ptr.ref, name);
        return new Value(vref);
    }

    /**
     * Store value in ptr
     */
    buildStore(value: Value, ptr: Value): Value {
        let vref = LLVM.LLVMBuildStore(this.ref, value.ref, ptr.ref);
        return new Value(vref);
    }

    /**
     * Generate element pointer for structs
     */
    buildStructGEP(value: Value, idx: number, name: string): Value {
        let vref = LLVM.LLVMBuildStructGEP(this.ref, value.ref, idx, name);
        return new Value(vref);
    }

    /**
     * Build cast of signed int to floating point
     */
    buildSIToFP(val: Value, destType: Type, name: string): Value {
        let vref = LLVM.LLVMBuildSIToFP(this.ref, val.ref, destType.ref, name);
        return new Value(vref);
    }

    /**
     * Build cast of floating point to signed int
     */
    buildFPToSI(val: Value, destType: Type, name: string): Value {
        let vref = LLVM.LLVMBuildFPToSI(this.ref, val.ref, destType.ref, name);
        return new Value(vref);
    }

    /**
     * Build bit cast
     */
    buildBitCast(val: Value, destType: Type, name: string): Value {
        let vref = LLVM.LLVMBuildBitCast(this.ref, val.ref, destType.ref, name);
        return new Value(vref);
    }

    /**
     * Insert value into aggregate
     */
    buildInsertValue(aggVal: Value, element: Value, idx: number, name: string): Value {
        let vref = LLVM.LLVMBuildInsertValue(this.ref, aggVal.ref, element.ref, idx, name);
        return new Value(vref);
    }

    /**
     * Build an integer addition instruction.
     */
    buildAdd(lhs: Value, rhs: Value, name: string): Value {
        let vref = LLVM.LLVMBuildAdd(this.ref, lhs.ref, rhs.ref, name);
        return new Value(vref);
    }

    /**
       * Build an floating point addition instruction.
       */
    buildFAdd(lhs: Value, rhs: Value, name: string): Value {
        let vref = LLVM.LLVMBuildFAdd(this.ref, lhs.ref, rhs.ref, name);
        return new Value(vref);
    }

    /**
     * Build an integer subtraction instruction
     */
    buildSub(lhs: Value, rhs: Value, name: string): Value {
        let vref = LLVM.LLVMBuildSub(this.ref, lhs.ref, rhs.ref, name);
        return new Value(vref);
    }

    /**
     * Build a floating point subtraction instruction
     */
    buildFSub(lhs: Value, rhs: Value, name: string): Value {
        let vref = LLVM.LLVMBuildFSub(this.ref, lhs.ref, rhs.ref, name);
        return new Value(vref);
    }

    /**
     * Build an integer multiplication instruction
     */
    buildMul(lhs: Value, rhs: Value, name: string): Value {
        let vref = LLVM.LLVMBuildMul(this.ref, lhs.ref, rhs.ref, name);
        return new Value(vref);
    }

    /**
     * Build a floating point multiplication instruction
     */
    buildFMul(lhs: Value, rhs: Value, name: string): Value {
        let vref = LLVM.LLVMBuildFMul(this.ref, lhs.ref, rhs.ref, name);
        return new Value(vref);
    }

    /**
     * Negate integer
     */
    buildNeg(val: Value, name: string): Value {
        let vref = LLVM.LLVMBuildNeg(this.ref, val.ref, name);
        return new Value(vref);
    }

    /**
     * Negate floating point value
     */
    buildFNeg(val: Value, name: string): Value {
        let vref = LLVM.LLVMBuildFNeg(this.ref, val.ref, name);
        return new Value(vref);
    }

    /**
     * Build a return instruction.
     */
    buildRet(arg: Value): Value {
        return LLVM.LLVMBuildRet(this.ref, arg.ref);
    }
}

///////////////////////////////////////////////////////
// Targets
///////////////////////////////////////////////////////

/**
 * Wraps an LLVMTargetMachineRef.
 */
export class TargetMachine extends Ref {
    static create(
        target: Target,
        triple: string,
        cpu: string = "",
        features: string = "",
        opt_level: number = 2,
        reloc_mode: number = 0,
        code_model: number = 0) {
        let tmref = LLVM.LLVMCreateTargetMachine(target.ref, triple, cpu, features, opt_level, reloc_mode, code_model);
        return new TargetMachine(tmref);
    }

    static getDefaultTargetTriple(): string {
        return LLVM.LLVMGetDefaultTargetTriple();
    }

    /**
     * Get the target machine's LLVMTargetRef object.
     */
    getTargetMachineTarget(): Target {
        let tref = LLVM.LLVMGetTargetMachineTarget(this.ref);
        return new Target(tref);
    }

    /**
     * Create an LLVMTargetDataRef that represents the target machine's data
     * layout.
     */
    createDataLayout(): TargetData {
        let tdref = LLVM.LLVMCreateTargetDataLayout(this.ref);
        return new TargetData(tdref);
    }
}

export class TargetData extends Ref {
    toString(): string {
        return LLVM.LLVMCopyStringRepOfTargetData(this.ref);
    }
}

/**
 * Wraps an LLVMTargetRef.
 */
export class Target extends Ref {
    static getFromTriple(triple: string): Target {
        let error_ptr = ref.alloc('string');
        let target_ptr = ref.alloc(voidp);
        if (LLVM.LLVMGetTargetFromTriple(triple, target_ptr, error_ptr)) {
            throw "error retrieving target";
        }
        return new Target(ref.deref(target_ptr));
    }

    /**
     * Get the target's description as a string.
     */
    description() {
        return LLVM.LLVMGetTargetDescription(this.ref);
    }

    /**
     * Get the target's name as a string.
     */
    name() {
        return LLVM.LLVMGetTargetName(this.ref);
    }

    /**
     * Converting the target to a string just gets its name.
     */
    toString() {
        return this.name();
    }
}

export function initX86Target(): void {
    LLVM.LLVMInitializeX86TargetInfo();
    LLVM.LLVMInitializeX86Target();
    LLVM.LLVMInitializeX86TargetMC();
}
