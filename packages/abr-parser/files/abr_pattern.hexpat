// Enter your pattern code here and click on the Play button
// below to execute your code. The results will then be visible
// in the Pattern Data view.
// 
// More information can be found in the documentation.
// 
// 
// Simple example:
// 
import std.io;

struct PhotoshopResourceSignature {
     char signature[4];
     char key[4];
     be u32 length;
};
 
struct Pattern {
     be u16 version;
     be u16 sub_version;
     PhotoshopResourceSignature samp;
     PhotoshopResourceSignature patt;
     PhotoshopResourceSignature desc;
     char string[4545];
};

Pattern my_pattern @ 0x00;
std::print("0x{:08X}", my_pattern.version);