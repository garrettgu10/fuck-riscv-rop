#include <stdio.h>
#include <stdint.h>
#include <sys/mman.h>
#include <stdlib.h>

void *fill_buf(void *location, FILE *fd) {
	uint64_t *buf = mmap((void*)location, 0x10000000, PROT_WRITE | PROT_READ, MAP_PRIVATE | MAP_ANON, -1, 0);

	if((uint64_t)buf == -1l) {
		perror("error mapping buf");
		exit(1);
	}

	if(buf != location) {
		printf("failed to allocate %lx\n", buf);
		exit(1);
	}

	int i = 0;

	while(!feof(fd)) {
		uint64_t next_val;
		fscanf(fd, "%lx\n", &next_val);
		buf[i++] = next_val;
	}

	return location;
}

void start_rop(void *stackbuf);

int main() {
	setbuf(stdout, NULL);
	FILE *stack_buf_fd = fopen("stackbuf.txt", "r");
	void *stack_buf = fill_buf((void*)0x10000000, stack_buf_fd);

	FILE *jmp_buf_fd = fopen("jmpbuf.txt", "r");
	void *jmp_buf = fill_buf((void*)0x20000000, jmp_buf_fd);

	uint64_t *scratch_buf = mmap((void*)0x30000000, 0x10000000, PROT_WRITE | PROT_READ, MAP_PRIVATE | MAP_ANON, -1, 0);
	if((uint64_t) scratch_buf != 0x30000000) {
		printf("could not allocate scratch buffer\n");
		exit(1);
	}

	start_rop(stack_buf);
}