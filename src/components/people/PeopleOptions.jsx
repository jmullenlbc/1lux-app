'use client';

// The two shapes a "pick a person" control takes in this app, both department-
// shaped the same way (src/lib/deptScreens.js): the people the field is really
// about come first, and everyone else is still reachable underneath.
//
// Nobody is ever removed from a picker. A person with no departments recorded
// shows up under "Everyone else", so an unfilled field can never make somebody
// unassignable.

import { useState } from 'react';
import { splitByDepartment, pickerDepartmentLabel } from '@/lib/deptScreens';
import { DEPARTMENT_LABEL } from '@/lib/departments';

const nameOf = u => u.name || u.email;

// <option> list for a plain <select>. Two groups, the short one first.
export function PersonOptions({ users, picker }) {
  const { theirs, others } = splitByDepartment(users, picker);
  if (!others.length) {
    return <>{theirs.map(u => <option key={u.id} value={u.id}>{nameOf(u)}</option>)}</>;
  }
  const label = pickerDepartmentLabel(picker, DEPARTMENT_LABEL);
  return (
    <>
      {theirs.length > 0 && (
        <optgroup label={label}>
          {theirs.map(u => <option key={u.id} value={u.id}>{nameOf(u)}</option>)}
        </optgroup>
      )}
      <optgroup label="Everyone else">
        {others.map(u => <option key={u.id} value={u.id}>{nameOf(u)}</option>)}
      </optgroup>
    </>
  );
}

// Tick-list shape: the department's people, then a link that reveals the rest.
// `renderPerson` draws one row however the surrounding screen already draws it.
export function PersonTickList({ users, picker, renderPerson }) {
  const { theirs, others } = splitByDepartment(users, picker);
  const [showAll, setShowAll] = useState(theirs.length === 0);
  const label = pickerDepartmentLabel(picker, DEPARTMENT_LABEL);

  return (
    <>
      {theirs.length > 0 && others.length > 0 && (
        <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-2 pb-1">{label}</div>
      )}
      {theirs.map(renderPerson)}

      {others.length > 0 && !showAll && (
        <button type="button" onClick={() => setShowAll(true)}
          className="w-full text-left px-2 py-1.5 text-[11px] text-slate-500 hover:text-slate-700">
          Show everyone else ({others.length})
        </button>
      )}
      {others.length > 0 && showAll && (
        <>
          {theirs.length > 0 && (
            <div className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide px-2 pt-2 pb-1">Everyone else</div>
          )}
          {others.map(renderPerson)}
        </>
      )}
    </>
  );
}
