import { duration, minutes, thaiTime, type Case } from "@/lib/model";
export default function LabPanel({
  c,
  names,
  now,
  target,
}: {
  c: Case;
  names: string[];
  now: number;
  target: number;
}) {
  const rows = [...new Set([...names, ...c.labs.map((l) => l.name)])];
  return (
    <section className="panel lab-panel">
      <div className="panel-heading">
        <h2>ผลตรวจทางห้องปฏิบัติการ</h2>
        <span className="source">HOSxP</span>
      </div>
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>Lab</th>
              <th>สั่งตรวจ</th>
              <th>รายงานผล</th>
              <th>ผลตรวจ</th>
              <th>Door → ผล</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((name) => {
              const l = c.labs.find((l) => l.name === name),
                elapsed = minutes(c.times.door_in.t, l?.reported);
              return (
                <tr key={name}>
                  <td>
                    <b>{name}</b>
                  </td>
                  {!l?.ordered ? (
                    <td colSpan={4} className="muted">
                      ยังไม่สั่ง
                    </td>
                  ) : (
                    <>
                      <td>{thaiTime(l.ordered)}</td>
                      <td>
                        {l.reported ? (
                          thaiTime(l.reported)
                        ) : (
                          <span className="waiting">
                            รอผล {duration(now - l.ordered)}
                          </span>
                        )}
                      </td>
                      <td>{l.reported ? l.result || "—" : "—"}</td>
                      <td>
                        {elapsed == null ? (
                          "—"
                        ) : (
                          <span
                            className={
                              name === "Troponin" && elapsed > target
                                ? "danger"
                                : "success"
                            }
                          >
                            {elapsed.toFixed(1)} นาที
                          </span>
                        )}
                      </td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
