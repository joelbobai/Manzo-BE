const app = require("./src/app");
// Port Number
const { PORT } = process.env;

const startApp = () => {
  app.listen(PORT, () => console.log(`Server Port: ${PORT}`));
};
startApp();
