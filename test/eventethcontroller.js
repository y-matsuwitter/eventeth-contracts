var EV = artifacts.require("./Eventeth.sol");
var EVC = artifacts.require("./EventethController");

contract('EventethController', function(accounts) {
  let evc;

  beforeEach(async function(){
    evc = await EVC.new()
  })

  it("should create event.", async function() {
    const name = "test event";

    let tx = await evc.createEvent(accounts[0], name,
      Math.floor(new Date().getTime()/1000) - 24*60*60,
      Math.floor(new Date().getTime()/1000) + 24*60*60,
      web3.toWei("0.01", "ether"), 10, {from: accounts[0]})

    assert.equal(tx.logs.length, 1, "EventCreated event should be omitted.");
    assert.equal(tx.logs[0].event, "EventCreated", "EventCreated event should be omitted.");

    const evAddr = tx.logs[0].args.eventAddress;
    let events = await evc.getOrganizerEvents(accounts[0])
    assert.notEqual(events.indexOf(evAddr), -1)

    let ev = await EV.at(evAddr);
    assert.equal(await ev.name(), name)
  });

  it("should returns organizer's event.", async function() {
    const name = "test event";
    await evc.createEvent(accounts[0], name,
      Math.floor(new Date().getTime()/1000) - 24*60*60,
      Math.floor(new Date().getTime()/1000) + 24*60*60,
      web3.toWei("0.01", "ether"), 10, {from: accounts[0]})

    const evs = await evc.getOrganizerEvents.call(accounts[0])
    assert.equal(evs.length, 1)
    const ev = await EV.at(evs[0])
    assert.equal(await ev.organizer(), accounts[0])
    assert.equal(await ev.name(), name)
  })
});
