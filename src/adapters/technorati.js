const utils = require('../utils.js');
const ajax = require('../ajax.js').ajax;
const bidfactory = require('../bidfactory.js');
const bidmanager = require('../bidmanager.js');

const TechnoratiAdapter = function TechnoratiAdapter() {

  let impMap = {};
  const BIDDER_CODE = 'technorati';
  const reqId = 1;
  let impId = 0;

  function _callBids(params) {
    let bids = params.bids || [];
    let pubId = (bids[0] && bids[0].params) ? bids[0].params.publisherId : '';
    let req = {
      id: reqId,
      site: {
        domain: location.hostname,
        page: location.href,
        ref: document.referrer
      },
      device: {
        ua: navigator.userAgent
      },
      imp: []
    };

    utils._each(bids, (bid, i) => {
      let name = bid.placementCode;
      let id = bid.params.placementId;
      let size = bid.sizes[0];
      impMap[impId] = {name: name, size: size, bid: bid, validBid: false};
      req.imp.push({
        id: impId,
        tagid: id,
        banner: {
          w: size[0],
          h: size[1],
          pos: i
        }
      });
      impId++;
    });
    if (impId > 0) {
      ajax("http" + ("https:" === location.protocol ? "s://uat-secure": "://uat-net")+ ".technoratimedia.com/openrtb/bids/" + pubId, (data) => {
        let parsedJson = {};
        try {
          parsedJson = JSON.parse(data);
        } catch (ignore) {}
        _addBidResponse(bids, parsedJson);
      }, JSON.stringify(req), {
        method: 'POST',
        withCredentials: true
      });
    }
  }

  function _addBidResponse(bids, data) {
    data = data || {seatbid: []};
    if (data.seatbid && data.seatbid.length && data.seatbid[0].bid) {
      utils._each(data.seatbid, (seatbid) => {
        utils._each(seatbid.bid, (bid) => {
          let imp = impMap[bid.impid] || [];
          let actual = bid.price;
          let price = actual;
          let creative = "";
          if (bid.nurl) {
            creative += "<img src='" + bid.nurl + "'>";
          }
          creative += bid.adm;
          let rtbMacros = {
            AUCTION_SEAT_ID: seatbid.seat,
            AUCTION_ID: reqId,
            AUCTION_BID_ID: data.bidid || bid.id,
            AUCTION_IMP_ID: bid.impid,
            AUCTION_AD_ID: bid.adid || '',
            AUCTION_PRICE: price,
            AUCTION_CURRENCY: "USD"
          };
          creative = _creativeReplace(creative, rtbMacros);
          price = Number(price);

          let bidResponse = bidfactory.createBid(1, bid);
          bidResponse.bidderCode = BIDDER_CODE;
          bidResponse.ad = creative;
          bidResponse.cpm = price * 10;
          bidResponse.width = (imp.size) ? imp.size[0] : 0;
          bidResponse.height = (imp.size) ? imp.size[1] : 0;
          bidResponse.creativeId = bid.cid || '';
          bidResponse.pubapiId = bid.id;
          bidResponse.currencyCode = "USD";

          bidmanager.addBidResponse(imp.name, bidResponse);
        });
      });
    } else {
      _addErrorBidResponses(bids, data);
    }
  }

  function _creativeReplace(creative, rtbMacros) {
    return creative.replace(/\${([^}]*)}/g, function (match, key) {
      if (key in rtbMacros) {
        return rtbMacros[key];
      } else {
        return match;
      }
    });
  }

  function _addErrorBidResponses(bids, data = {}) {
    utils._each(bids, (bid) => {
      let bidResponse = bidfactory.createBid(2, bid);
      bidResponse.bidderCode = BIDDER_CODE;
      bidResponse.reason = 'no bid';
      bidResponse.raw = data;
      bidmanager.addBidResponse(bid.placementCode, bidResponse);
    });
  }

  return {
    callBids: _callBids
  };
};

module.exports = TechnoratiAdapter;
