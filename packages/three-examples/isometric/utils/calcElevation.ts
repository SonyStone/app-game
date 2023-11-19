export function calcElevation(vertDiff: any[], treshold: number) {
		
  let dir = 0;
  let steepness = 0;
  
  if(vertDiff[0] + vertDiff[1] - treshold > vertDiff[2] + vertDiff[3]) {
    dir = 1; //darker
    steepness = vertDiff[0] + vertDiff[1] - vertDiff[2] + vertDiff[3];
  } else if(vertDiff[1] + vertDiff[3] - treshold > vertDiff[0] + vertDiff[2]) {
    dir = 2; //darker
    steepness = vertDiff[1] + vertDiff[3] - vertDiff[0] + vertDiff[2];
  } else if(vertDiff[2] + vertDiff[3] - treshold > vertDiff[0] + vertDiff[1]) {
    dir = 3; //lighter
    steepness = vertDiff[2] + vertDiff[3] - vertDiff[0] + vertDiff[1];
  } else if(vertDiff[0] + vertDiff[2] - treshold > vertDiff[1] + vertDiff[3]) {
    dir = 4; //lighter
    steepness = vertDiff[0] + vertDiff[2] - vertDiff[1] + vertDiff[3];
  } else {
    dir = 0; //neutral
    steepness = 0;
  }
  
  return [dir, steepness];
}