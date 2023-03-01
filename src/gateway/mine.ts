import {Router} from 'express';
import Web3 from 'web3'
import {mixGetPost} from "./middlewares.js";
const {utils: {sha3}} = Web3;

const mine = function(seed, difficulty = 5) {
  let nonce = 0;
  // @ts-ignore
  difficulty = parseInt(difficulty)
  const prefix = '0x' + new Array(difficulty).fill('0').join('')
  while (true) {
    const h = sha3(seed + nonce);
    if (!!h && h.startsWith(prefix)) {
      return nonce;
    }
    nonce += 1;
  }
}

const router = Router();

router.use('/', mixGetPost, (req, res, next) => {
  // @ts-ignore
  const {seed, difficulty} = req.mixed;
  if(!seed) {
    res
      .status(500)
      .send({
        success: false,
        error: "missing seed."
      })
    return;
  }
  const nonce = mine(seed, difficulty);
  res
    .send({success: true, nonce})
})

export default router;
