module.exports = function(...nums) {
  const result = nums.map(Number).reduce((a, b) => a + b, 0);
  console.log(`Sum: ${result}`);
};
