import {expect} from 'chai';
import * as utils from 'src/utils';
import TechnoratiAdapter from 'src/adapters/technorati';
import bidmanager from 'src/bidmanager';

const DEFAULT_BIDDER_REQUEST = {
  bidderCode: 'technorati',
  requestId: 'd3e07445-ab06-44c8-a9dd-5ef9af06d2a6',
  bidderRequestId: '7101db09af0db2',
  start: new Date().getTime(),
  bids: [{
    bidder: 'technorati',
    bidId: '84ab500420319d',
    bidderRequestId: '7101db09af0db2',
    requestId: 'd3e07445-ab06-44c8-a9dd-5ef9af06d2a6',
    placementCode: 'foo',
    sizes: [[300,250]],
    params: {
      publisherId: '1234',
      placementId: 'placementid'
    }
  }]
};
const DEFAULT_PUBAPI_RESPONSE = {
  "id": "245730051428950632",
  "cur": "USD",
  "seatbid": [{
    "seat":25,
    "bid": [{
      "id": 1,
      "cid": 'cid',
      "impid": 0,
      "price": 0.089,
      "adm": "<script>logInfo('ad');</script>"
    }]
  }]
};

describe('TechnoratiAdapter', () => {

  let adapter;

  beforeEach(() => adapter = new TechnoratiAdapter());

  function createBidderRequest({bids, params} = {}) {
    var bidderRequest = utils.cloneJson(DEFAULT_BIDDER_REQUEST);
    if (bids && Array.isArray(bids)) {
      bidderRequest.bids = bids;
    }
    if (params) {
      bidderRequest.bids.forEach(bid => bid.params = params);
    }
    return bidderRequest;
  }

  describe('callBids()', () => {
    it('exists and is a function', () => {
      expect(adapter.callBids).to.exist.and.to.be.a('function');
    });

    describe('bid request', () => {
      let xhr;
      let requests;

      beforeEach(() => {
        xhr = sinon.useFakeXMLHttpRequest();
        requests = [];
        xhr.onCreate = request => requests.push(request);
      });

      afterEach(() => xhr.restore());

      it('requires parameters to be made', () => {
        adapter.callBids({});
        expect(requests).to.be.empty;
      });

      it('should hit the endpoint and have correct publisher id', () => {
        adapter.callBids(DEFAULT_BIDDER_REQUEST);
        expect(requests[0].url).to.contain('technoratimedia.com/openrtb/bids/' + DEFAULT_BIDDER_REQUEST.bids[0].params.publisherId);
      });

      it('should contain required params', () => {
        adapter.callBids(createBidderRequest({
          params: {
            placementId: '12345'
          }
        }));
        let body = JSON.parse(requests[0].requestBody);
        expect(body.id).to.equal(1);
        expect(body.site).to.exist.and.to.be.a('object');
        expect(body.imp).to.be.a('array');
        expect(body.imp[0].id).to.equal(0);
        expect(body.imp[0].tagid).to.equal('12345');
        expect(body.imp[0].banner.w).to.equal(300);
        expect(body.imp[0].banner.h).to.equal(250);
      });
    });

    describe('bid response', () => {

      let server;

      beforeEach(() => {
        server = sinon.fakeServer.create();
        sinon.stub(bidmanager, 'addBidResponse');
      });

      afterEach(() => {
        server.restore();
        bidmanager.addBidResponse.restore();
      });

      it('should be added to bidmanager if returned from pubapi', () => {
        server.respondWith(JSON.stringify(DEFAULT_PUBAPI_RESPONSE));
        adapter.callBids(DEFAULT_BIDDER_REQUEST);
        server.respond();
        expect(bidmanager.addBidResponse.calledOnce).to.be.true;
      });

      it('should be added to bidmanager as invalid in case of empty response', () => {
        server.respondWith('');
        adapter.callBids(DEFAULT_BIDDER_REQUEST);
        server.respond();
        expect(bidmanager.addBidResponse.calledOnce).to.be.true;
        expect(bidmanager.addBidResponse.firstCall.args[1].getStatusCode()).to.equal(2);
      });

      it('should be added to bidmanager with correct params', () => {
        server.respondWith(JSON.stringify(DEFAULT_PUBAPI_RESPONSE));
        adapter.callBids(DEFAULT_BIDDER_REQUEST);
        server.respond();
        expect(bidmanager.addBidResponse.calledOnce).to.be.true;
        let bid = bidmanager.addBidResponse.firstCall.args[1];
        expect(bid).to.have.property('bidderCode', 'technorati');
        expect(bid).to.have.property('ad', "<script>logInfo(\'ad\');</script>");
        expect(bid).to.have.property('cpm', 0.8899999999999999);
        expect(bid).to.have.property('width', 300);
        expect(bid).to.have.property('height', 250);
        expect(bid).to.have.property('creativeId', 'cid');
        expect(bid).to.have.property('pubapiId', 1);
        expect(bid).to.have.property('currencyCode', 'USD');
      });

      it('should add an image tag correctly', () => {
        var response = utils.cloneJson(DEFAULT_PUBAPI_RESPONSE);
        response.seatbid[0].bid[0].nurl = "nurltest";
        server.respondWith(JSON.stringify(response));
        adapter.callBids(DEFAULT_BIDDER_REQUEST);
        server.respond();
        expect(bidmanager.addBidResponse.calledOnce).to.be.true;
        let bid = bidmanager.addBidResponse.firstCall.args[1];
        expect(bid).to.have.property('ad', "<img src=\'nurltest\'><script>logInfo(\'ad\');</script>");
      });

      it('should replace creative macros correctly', () => {
        var response = utils.cloneJson(DEFAULT_PUBAPI_RESPONSE);
        response.seatbid[0].bid[0].adm = "test${AUCTION_SEAT_ID}${AUCTION_ID}${AUCTION_BID_ID}${AUCTION_IMP_ID}${AUCTION_AD_ID}${AUCTION_PRICE}${AUCTION_CURRENCY}${NOT_A_KEY}test";
        server.respondWith(JSON.stringify(response));
        adapter.callBids(DEFAULT_BIDDER_REQUEST);
        server.respond();
        expect(bidmanager.addBidResponse.calledOnce).to.be.true;
        let bid = bidmanager.addBidResponse.firstCall.args[1];
        expect(bid).to.have.property('ad', "test251100.089USD${NOT_A_KEY}test");
      });

      it('should handle no data correctly', () => {
        server.respondWith(JSON.stringify(""));
        adapter.callBids(DEFAULT_BIDDER_REQUEST);
        server.respond();
        expect(bidmanager.addBidResponse.calledOnce).to.be.true;
        let bid = bidmanager.addBidResponse.firstCall.args[1];
      });

      it('should handle invalid impression correctly', () => {
        var response = utils.cloneJson(DEFAULT_PUBAPI_RESPONSE);
        response.seatbid[0].bid[0].impid = 'cows';
        server.respondWith(JSON.stringify(response));
        adapter.callBids(DEFAULT_BIDDER_REQUEST);
        server.respond();
        expect(bidmanager.addBidResponse.calledOnce).to.be.true;
        let bid = bidmanager.addBidResponse.firstCall.args[1];
      });

      it('should handle invalid creative id correctly', () => {
        var response = utils.cloneJson(DEFAULT_PUBAPI_RESPONSE);
        response.seatbid[0].bid[0].cid = undefined;
        server.respondWith(JSON.stringify(response));
        adapter.callBids(DEFAULT_BIDDER_REQUEST);
        server.respond();
        expect(bidmanager.addBidResponse.calledOnce).to.be.true;
        let bid = bidmanager.addBidResponse.firstCall.args[1];
      });
    });
  });
});

