//! Beat detection and the mapping from the rhythm strip to the lead panels.
//!
//! The rhythm strip is a study's sole timing authority: it is the only trace
//! that spans the whole record, so it is where beats are found and where rate is
//! measured. The twelve 2.5 s panels inherit that timing rather than deriving
//! their own.

pub mod detect;
