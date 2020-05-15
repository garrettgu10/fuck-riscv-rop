	/* start_rop(void* stackbuf) */
	.global start_rop
start_rop:
	mv sp, a0
	ld ra, 8(sp)
	add sp, sp, 0x10
	ret