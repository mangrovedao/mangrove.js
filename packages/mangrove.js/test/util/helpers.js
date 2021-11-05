const ethers = require("ethers");

exports.sleep = (ms) => {
  return new Promise((cb) => setTimeout(cb, ms));
};

exports.asyncQueue = () => {
  const promises = [],
    elements = [];
  return {
    put: (elem) => {
      if (promises.length > 0) {
        promises.shift()(elem);
      } else {
        elements.push(elem);
      }
    },
    get: () => {
      if (elements.length > 0) {
        return Promise.resolve(elements.shift());
      } else {
        return new Promise((ok) => promises.push(ok));
      }
    },
  };
};

/* Returns a promise with resolve/reject accessible from the outside. */
exports.Deferred = () => {
  let _ok, _ko;
  const p = new Promise((ok, ko) => ([_ok, _ko] = [ok, ko]));
  p.ok = _ok;
  p.ko = _ko;
  return p;
};

exports.toWei = (v, u = "ether") => ethers.utils.parseUnits(v.toString(), u);

exports.newOffer = (mgv, base, quote, { wants, gives, gasreq, gasprice }) => {
  return mgv.contract.newOffer(
    base,
    quote,
    exports.toWei(wants),
    exports.toWei(gives),
    gasreq || 10000,
    gasprice || 1,
    0
  );
};
