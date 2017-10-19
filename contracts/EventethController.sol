pragma solidity ^0.4.15;

import "./Eventeth.sol";

contract EventethController {
  address owner;

  address[] events;
  mapping (address => uint[]) organizerEvents;

  event EventCreated(
    address eventAddress,
    address _organizer, string _name,
    uint _registrationStarted, uint _registrationEnded,
    uint _minimumGuarantee, uint _capacity);

  function EventethController() public {
    owner = msg.sender;
  }

  function createEvent(address _organizer, string _name, uint _registrationStarted, uint _registrationEnded, uint _minimumGuarantee, uint _capacity)
    public
    returns (address eventAddr)
  {
    eventAddr = new Eventeth(_organizer, _name, _registrationStarted, _registrationEnded, _minimumGuarantee, _capacity, owner);
    uint idx = events.length;
    events.push(eventAddr);
    organizerEvents[_organizer].push(idx);
    EventCreated(eventAddr, _organizer, _name, now, _registrationEnded, _minimumGuarantee, _capacity);
  }

  function getOrganizerEvents(address _organizer)
    public
    constant
    returns (address[] _events)
  {
    var evts = organizerEvents[_organizer];
    _events = new address[](evts.length);
    for (uint i = 0; i < evts.length; i++) {
      _events[i] = events[evts[i]];
    }
  }
}
